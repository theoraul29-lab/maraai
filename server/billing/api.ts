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
import {
  isStripeConfigured,
  createCheckoutSession as createStripeCheckout,
  verifyWebhookEvent as verifyStripeEvent,
  handleStripeEvent,
  cancelUserSubscriptionAtPeriodEnd as cancelStripeAtPeriodEnd,
} from './stripe.js';

function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === 'true';
}

function stripeConfigured(): boolean {
  return isStripeConfigured();
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
    try {
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

      // Stripe Checkout — create a live Session and return its URL so the
      // frontend can redirect. We intentionally DO NOT create a
      // `subscriptions` row here; that happens in the webhook after payment
      // is confirmed, which is the only trustworthy signal.
      if (provider === 'stripe') {
        try {
          const user = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          const { url, sessionId } = await createStripeCheckout({
            userId,
            userEmail: user[0]?.email ?? null,
            plan,
          });
          return res.json({ url, sessionId, provider: 'stripe' });
        } catch (err) {
          console.error('[billing] stripe checkout failed:', err);
          return res.status(502).json({
            error: 'stripe_checkout_failed',
            message: 'Could not create Stripe checkout session.',
          });
        }
      }

      // PayPal wiring ships in P2.0.2 — same shape (returns { url }) so the
      // frontend just picks the provider and redirects.
      return res.status(501).json({
        error: 'checkout_not_implemented',
        message: 'PayPal checkout not wired yet (Phase 2 P2.0.2).',
        planId,
        provider,
      });
    } catch (err) {
      console.error('[billing] POST /subscribe failed:', err);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/billing/cancel
  // Marks the caller's active subscription as 'cancelled' but leaves
  // periodEnd intact so feature access continues until the paid period
  // ends (standard SaaS behaviour). Also issues a cancel-at-period-end on
  // the provider when payments are enabled — scaffolded in follow-up.
  // -------------------------------------------------------------------------
  app.post('/api/billing/cancel', async (req: Request, res: Response) => {
    try {
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
        // Match the tie-break used by getActivePlanId so cancel always
        // targets the same row that is currently granting access.
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      const sub = rows[0];
      if (!sub) {
        return res.status(404).json({ error: 'no_active_subscription' });
      }

      // If the subscription has no known paid-period end, set it to now so
      // access is revoked immediately instead of being granted indefinitely
      // (defence against cancelled rows that predate the webhook flow).
      const now = new Date();
      const preservedPeriodEnd = sub.periodEnd ?? now;

      // For live Stripe subscriptions, cancel at period end so the user
      // keeps access until they've consumed what they paid for. The DB
      // update will be reconciled by the webhook; we still write a local
      // 'cancelled' marker now so /me reflects the intent immediately.
      if (sub.provider === 'stripe' && sub.providerSubscriptionId) {
        try {
          await cancelStripeAtPeriodEnd(sub.providerSubscriptionId);
        } catch (err) {
          console.error('[billing] stripe cancel_at_period_end failed:', err);
          // Intentionally continue: we still want to record the cancellation
          // locally so the user isn't stuck if the provider call hiccups.
        }
      }

      await db
        .update(subscriptions)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          periodEnd: preservedPeriodEnd,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, sub.id));

      return res.json({
        ok: true,
        subscriptionId: sub.id,
        status: 'cancelled',
        periodEnd: preservedPeriodEnd,
      });
    } catch (err) {
      console.error('[billing] POST /cancel failed:', err);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/billing/stripe/webhook
  // Live webhook handler. Verifies the Stripe signature against the raw
  // request body (captured by the express.json `verify` hook in index.ts)
  // and dispatches to idempotent upserts in `stripe.ts#handleStripeEvent`.
  //
  // We always 200 after a successful verify, even if the event is one we
  // don't act on, so Stripe stops retrying. Unhandled events are no-ops.
  // -------------------------------------------------------------------------
  app.post('/api/billing/stripe/webhook', async (req: Request, res: Response) => {
    if (!stripeConfigured()) {
      return res.status(503).json({ error: 'stripe_not_configured' });
    }
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !signature) {
      return res.status(400).json({ error: 'missing_signature' });
    }
    const rawBody = req.rawBody;
    if (!(rawBody instanceof Buffer)) {
      // express.json captured rawBody as a Buffer in index.ts; if it's
      // missing here something upstream is stripping it and signature
      // verification cannot succeed.
      console.error('[billing] stripe webhook missing rawBody');
      return res.status(400).json({ error: 'missing_raw_body' });
    }
    let event;
    try {
      event = verifyStripeEvent(rawBody, signature);
    } catch (err) {
      console.error('[billing] stripe signature verify failed:', err);
      return res.status(400).json({ error: 'invalid_signature' });
    }
    try {
      await handleStripeEvent(event);
    } catch (err) {
      console.error('[billing] stripe event handler failed:', event.type, err);
      // Return 500 so Stripe retries — our upserts are idempotent.
      return res.status(500).json({ error: 'handler_failed' });
    }
    return res.json({ received: true });
  });

  app.post('/api/billing/paypal/webhook', (_req: Request, res: Response) => {
    if (!paymentsEnabled() || !paypalConfigured()) {
      return res.status(503).json({ error: 'paypal_not_configured' });
    }
    return res.status(501).json({ error: 'webhook_not_implemented' });
  });
}
