/**
 * HTTP endpoints for the subscriptions module.
 *
 * Payment rails (Stripe / PayPal) are intentionally **scaffolded but
 * disabled** in this PR. The surface is in place so the UI can be built
 * against it; the `/subscribe` path returns `503 payments_disabled` until
 * the operator sets `PAYMENTS_ENABLED=true` **and** supplies real provider
 * keys. This lets us ship UI + feature-gating now without exposing
 * half-finished payment flows.
 */

import type { Express, Request, Response } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { plans, subscriptions } from '../../shared/models/billing.js';
import { users } from '../../shared/models/auth.js';
import { PLAN_CATALOGUE } from './plans.js';
import { getActivePlanId } from './features.js';

function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === 'true';
}

function stripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function paypalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

const subscribeBodySchema = z.object({
  planId: z.string().min(1),
  provider: z.enum(['stripe', 'paypal']),
});

interface SessionWithUser {
  userId?: string;
}

/**
 * Return the session's userId regardless of whether it belongs to a real
 * account or an anonymous visitor. Use this for read-only surfaces like
 * `/billing/me` which are safe for anonymous callers.
 */
function getSessionUserId(req: Request): string | null {
  return (req.session as SessionWithUser | undefined)?.userId ?? null;
}

/**
 * Return the userId **only** if it corresponds to a real signed-up user.
 *
 * `setupSessionAuth` assigns a random userId to every anonymous visitor
 * (see `server/auth.ts`) so `req.session.userId` on its own is not proof
 * of authentication. For write surfaces (subscribe / cancel) we must
 * additionally verify the id exists in the `users` table.
 */
async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const sessionUserId = getSessionUserId(req);
  if (!sessionUserId) return null;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, sessionUserId))
    .limit(1);
  return rows[0]?.id ?? null;
}

function serialisePlan(plan: typeof plans.$inferSelect) {
  let features: string[] = [];
  try {
    features = JSON.parse(plan.features) as string[];
  } catch {
    features = [];
  }
  return {
    id: plan.id,
    tier: plan.tier,
    period: plan.period,
    priceCents: plan.priceCents,
    currency: plan.currency,
    features,
  };
}

export function registerBillingApi(app: Express): void {
  // -------------------------------------------------------------------------
  // GET /api/billing/plans
  // Public catalogue. Used by the pricing page and by the admin UI.
  // -------------------------------------------------------------------------
  app.get('/api/billing/plans', async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(plans)
        .where(eq(plans.active, true));
      // Keep the canonical order from PLAN_CATALOGUE; DB order is not
      // guaranteed and we want consistent rendering across clients.
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = PLAN_CATALOGUE
        .map((p) => byId.get(p.id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map(serialisePlan);
      res.json({ plans: ordered });
    } catch (err) {
      console.error('[billing] GET /plans failed:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/billing/me
  // Returns the caller's active plan id + feature list + subscription row
  // (if any). Anonymous users get { planId: 'free' } with no subscription.
  // -------------------------------------------------------------------------
  app.get('/api/billing/me', async (req: Request, res: Response) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      const planId = await getActivePlanId(userId);
      const planDef = PLAN_CATALOGUE.find((p) => p.id === planId);

      let currentSub: typeof subscriptions.$inferSelect | null = null;
      if (userId) {
        const rows = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1);
        currentSub = rows[0] ?? null;
      }

      res.json({
        planId,
        tier: planDef?.tier ?? 'free',
        features: planDef?.features ?? [],
        subscription: currentSub,
        paymentsEnabled: paymentsEnabled(),
      });
    } catch (err) {
      console.error('[billing] GET /me failed:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/billing/subscribe
  // Creates a checkout session with the requested provider. Currently
  // 503 until real keys are wired in — this keeps the surface visible to
  // the UI so we can build against it.
  // -------------------------------------------------------------------------
  app.post('/api/billing/subscribe', async (req: Request, res: Response) => {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'not_authenticated' });
    }

    const parsed = subscribeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { planId, provider } = parsed.data;

    const plan = PLAN_CATALOGUE.find((p) => p.id === planId);
    if (!plan) {
      return res.status(404).json({ error: 'unknown_plan', planId });
    }

    if (plan.tier === 'free') {
      return res
        .status(400)
        .json({ error: 'free_plan_not_subscribable', planId });
    }

    if (!paymentsEnabled()) {
      return res.status(503).json({
        error: 'payments_disabled',
        message:
          'Payments are not yet enabled on this deployment. Contact the operator to set PAYMENTS_ENABLED=true and configure Stripe / PayPal keys.',
      });
    }

    if (provider === 'stripe' && !stripeConfigured()) {
      return res.status(503).json({
        error: 'stripe_not_configured',
        message: 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable Stripe.',
      });
    }
    if (provider === 'paypal' && !paypalConfigured()) {
      return res.status(503).json({
        error: 'paypal_not_configured',
        message: 'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable PayPal.',
      });
    }

    // Real Checkout session creation will be wired here in a follow-up
    // once operator keys are in place. We intentionally *do not* create a
    // DB row yet — it's the webhook's job to persist the subscription
    // once the provider confirms payment.
    return res.status(501).json({
      error: 'checkout_not_implemented',
      message:
        'Provider checkout wiring ships in a follow-up PR; this endpoint currently only validates configuration.',
      planId,
      provider,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/billing/cancel
  // Marks the caller's active subscription as 'cancelled' but leaves
  // periodEnd intact so feature access continues until the paid period
  // ends (standard SaaS behaviour). Also issues a cancel-at-period-end on
  // the provider when payments are enabled — scaffolded in follow-up.
  // -------------------------------------------------------------------------
  app.post('/api/billing/cancel', async (req: Request, res: Response) => {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'not_authenticated' });
    }

    const rows = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active'),
        ),
      )
      .limit(1);
    const sub = rows[0];
    if (!sub) {
      return res.status(404).json({ error: 'no_active_subscription' });
    }

    await db
      .update(subscriptions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    res.json({ ok: true, subscriptionId: sub.id, status: 'cancelled' });
  });

  // -------------------------------------------------------------------------
  // Stripe webhook stub.
  // Signature verification + event handling is the next follow-up. We
  // register the route now so the URL is stable and can be added to the
  // Stripe dashboard before the implementation lands.
  // -------------------------------------------------------------------------
  app.post('/api/billing/stripe/webhook', (_req: Request, res: Response) => {
    if (!paymentsEnabled() || !stripeConfigured()) {
      return res.status(503).json({ error: 'stripe_not_configured' });
    }
    return res.status(501).json({ error: 'webhook_not_implemented' });
  });

  app.post('/api/billing/paypal/webhook', (_req: Request, res: Response) => {
    if (!paymentsEnabled() || !paypalConfigured()) {
      return res.status(503).json({ error: 'paypal_not_configured' });
    }
    return res.status(501).json({ error: 'webhook_not_implemented' });
  });
}
