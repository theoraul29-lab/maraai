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
  expandWithPrerequisites,
} from './programs.js';
import { isPayPalConfigured, createPayPalOrder, capturePayPalOrder } from './paypal.js';
import { createInvoice } from './invoices.js';

function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === 'true';
}

// Accepts either the original single-item shape (still used by
// PayPalProgramButton.tsx for the bundle/book buy buttons) or a `items`
// array — the "pick your own programs" card on the Pricing page lets the
// user choose any subset of the 4 paid programs and pay for all of them in
// one PayPal checkout instead of one purchase per program.
const purchaseBodySchema = z.union([
  z.object({ item: z.string().min(1) }),
  z.object({ items: z.array(z.string().min(1)).min(1).max(4) }),
]);

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

  // POST /api/billing/program/purchase — creates a PayPal order for one or
  // more items (see purchaseBodySchema above).
  app.post('/api/billing/program/purchase', requireRealUser, async (req: Request, res: Response) => {
    try {
      const parsed = purchaseBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      }
      const userId = (req as any).user!.uid as string;
      const requestedIds = 'items' in parsed.data ? [...new Set(parsed.data.items)] : [parsed.data.item];

      // Anti-skip rule (see programs.ts#expandWithPrerequisites): buying
      // new_life without already owning new_skills/new_body pulls those
      // into this same purchase automatically, at their normal price each —
      // there's no way to pay for a later program while skipping what's
      // missing before it in the sequence.
      const expandedIds = [...new Set(requestedIds.flatMap((id) => expandWithPrerequisites(userId, id)))];

      const items = expandedIds.map((id) => findPurchasableItem(id));
      const missingIndex = items.findIndex((i) => !i);
      if (missingIndex !== -1) {
        return res.status(404).json({ error: 'unknown_item', item: expandedIds[missingIndex] });
      }
      const resolvedItems = items as NonNullable<(typeof items)[number]>[];

      const alreadyOwned = new Set(purchasedItemIds(userId));
      const toBuy = resolvedItems.filter((item) => !alreadyOwned.has(item.id));
      if (toBuy.length === 0) {
        return res.status(400).json({ error: 'already_purchased', items: resolvedItems.map((i) => i.id) });
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
        items: toBuy.map((item) => ({ id: item.id, name: item.name, priceCents: item.priceCents })),
      });
      // One pending row per item, all sharing this order id — the capture
      // handler below resolves each one individually once PayPal confirms
      // the (single) payment.
      for (const item of toBuy) {
        createPendingPurchase({
          userId,
          item: item.id,
          priceCents: item.priceCents,
          paypalOrderId: orderId,
        });
      }
      // orderId: for the embedded PayPal Buttons SDK flow (createOrder must
      // return the raw order id). approvalUrl: for the no-JS-SDK fallback
      // (full-page redirect to PayPal). See PayPalProgramButton.tsx.
      res.json({
        orderId,
        approvalUrl,
        provider: 'paypal',
        items: toBuy.map((item) => item.id),
        totalCents: toBuy.reduce((sum, item) => sum + item.priceCents, 0),
      });
    } catch (err) {
      console.error('[billing/programs] purchase failed:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/billing/program/capture — PayPal return_url after approval.
  // token = the PayPal order id (PayPal's own query param name). custom_id
  // is `${userId}:${id1,id2,...}` — one order can cover several items (see
  // POST /purchase above), so every id in the list gets marked completed.
  app.get('/api/billing/program/capture', async (req: Request, res: Response) => {
    const orderId = typeof req.query.token === 'string' ? req.query.token : null;
    if (!orderId) return res.redirect('/missions?payment=invalid');
    try {
      const result = await capturePayPalOrder(orderId);
      if (result.status !== 'COMPLETED' || !result.customId) {
        return res.redirect('/missions?payment=failed');
      }
      const [userId, idsStr] = result.customId.split(':');
      if (userId && idsStr) {
        for (const id of idsStr.split(',')) {
          const def = findPurchasableItem(id);
          if (def) {
            const purchaseId = markPurchaseCompleted({
              userId,
              item: def.id,
              priceCents: def.priceCents,
              paypalOrderId: orderId,
            });
            try {
              createInvoice({
                userId,
                sourceType: 'program_purchase',
                sourceId: purchaseId,
                description: def.name,
                amountCents: def.priceCents,
              });
            } catch (err) {
              // Never let invoicing block granting the access the user paid
              // for — log and move on; the invoice can be backfilled.
              console.error('[billing/programs] invoice creation failed:', err);
            }
          }
        }
      }
      return res.redirect('/missions?payment=success');
    } catch (err) {
      console.error('[billing/programs] capture failed:', err);
      return res.redirect('/missions?payment=failed');
    }
  });
}
