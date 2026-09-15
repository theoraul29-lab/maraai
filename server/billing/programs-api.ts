/**
 * HTTP endpoints for one-time program/bundle/book purchases.
 *
 * Same "scaffolded but disabled" posture as server/billing/api.ts: real
 * routes, real DB writes, but /purchase returns 503 until the operator sets
 * PAYMENTS_ENABLED=true and configures PayPal. Only PayPal is wired here
 * (Stripe's helper only supports subscription-mode checkout — see
 * server/billing/stripe.ts — one-time Stripe Checkout is a separate,
 * not-yet-built path).
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { users } from '../../shared/models/auth.js';
import { eq } from 'drizzle-orm';
import { PROGRAM_CATALOGUE } from './plans.js';
import {
  findPurchasableItem,
  purchasedItemIds,
  hasPurchasedBook,
  createPendingPurchase,
  markPurchaseCompleted,
} from './programs.js';
import { isPayPalConfigured, createPayPalOrder, capturePayPalOrder } from './paypal.js';

function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === 'true';
}

const purchaseBodySchema = z.object({
  item: z.string().min(1),
});

export function registerProgramBillingApi(
  app: Express,
  requireRealUser: (req: any, res: any, next: any) => void,
): void {
  // GET /api/billing/programs — the 6 progression programs (matches the
  // shape frontend/src/Missions.tsx's "Transformation progression" section
  // already renders — durationDays, priceCents, freeDays kept for that UI's
  // sake even though freeDays is always 0 now: a program is either free
  // outright (New Mindset/Habit) or a single flat unlock, never partially
  // free). Bundle + book are separate purchasable items (see
  // purchasableItems()) with no dedicated UI yet — reachable today via
  // POST /api/billing/program/purchase {item:'bundle_all_programs'|'book_new_you'}.
  app.get('/api/billing/programs', async (req: Request, res: Response) => {
    const userId = (req as any).user?.uid as string | undefined;
    const purchased = new Set(userId ? purchasedItemIds(userId) : []);
    res.json({
      programs: PROGRAM_CATALOGUE.map((p) => ({
        id: p.id,
        name: p.name,
        durationDays: p.durationDays,
        priceCents: p.priceCents,
        freeDays: 0,
        currency: 'EUR',
        purchased: p.priceCents === 0 || purchased.has(p.id),
      })),
      paymentsEnabled: paymentsEnabled(),
    });
  });

  // GET /api/billing/program/access — the caller's own purchased item ids.
  app.get('/api/billing/program/access', requireRealUser, (req: Request, res: Response) => {
    const userId = (req as any).user!.uid as string;
    res.json({ purchased: purchasedItemIds(userId), bookPurchased: hasPurchasedBook(userId) });
  });

  // POST /api/billing/program/purchase — creates a PayPal order for one item.
  app.post('/api/billing/program/purchase', requireRealUser, async (req: Request, res: Response) => {
    try {
      const parsed = purchaseBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      }
      const item = findPurchasableItem(parsed.data.item);
      if (!item) return res.status(404).json({ error: 'unknown_item', item: parsed.data.item });

      const userId = (req as any).user!.uid as string;
      if (purchasedItemIds(userId).includes(item.id)) {
        return res.status(400).json({ error: 'already_purchased', item: item.id });
      }

      if (!paymentsEnabled()) {
        return res.status(503).json({
          error: 'payments_disabled',
          message: 'Payments are not yet enabled on this deployment.',
        });
      }
      if (!isPayPalConfigured()) {
        return res.status(503).json({
          error: 'paypal_not_configured',
          message: 'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable purchases.',
        });
      }

      const userRow = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      const { orderId, approvalUrl } = await createPayPalOrder({
        userId,
        userEmail: userRow[0]?.email ?? null,
        programId: item.id,
        programName: item.name,
        amountCents: item.priceCents,
      });
      createPendingPurchase({
        userId,
        item: item.id,
        priceCents: item.priceCents,
        paypalOrderId: orderId,
      });
      // orderId: for the embedded PayPal Buttons SDK flow (createOrder must
      // return the raw order id). approvalUrl: for the no-JS-SDK fallback
      // (full-page redirect to PayPal). See PayPalProgramButton.tsx.
      res.json({ orderId, approvalUrl, provider: 'paypal' });
    } catch (err) {
      console.error('[billing/programs] purchase failed:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/billing/program/capture — PayPal return_url after approval.
  // token = the PayPal order id (PayPal's own query param name).
  app.get('/api/billing/program/capture', async (req: Request, res: Response) => {
    const orderId = typeof req.query.token === 'string' ? req.query.token : null;
    if (!orderId) return res.redirect('/missions?payment=invalid');
    try {
      const result = await capturePayPalOrder(orderId);
      if (result.status !== 'COMPLETED' || !result.customId) {
        return res.redirect('/missions?payment=failed');
      }
      const [userId, item] = result.customId.split(':');
      const def = findPurchasableItem(item);
      if (userId && def) {
        markPurchaseCompleted({
          userId,
          item: def.id,
          priceCents: def.priceCents,
          paypalOrderId: orderId,
        });
      }
      return res.redirect('/missions?payment=success');
    } catch (err) {
      console.error('[billing/programs] capture failed:', err);
      return res.redirect('/missions?payment=failed');
    }
  });
}
