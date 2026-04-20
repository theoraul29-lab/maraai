/**
 * Stripe integration (Phase 2 P2.0.1).
 *
 * Lazy module: the Stripe client is instantiated only when `STRIPE_SECRET_KEY`
 * is present, so deployments without payment keys boot cleanly and the
 * `/subscribe` endpoint returns a 503 instead of crashing on import.
 *
 * Responsibilities:
 *   - Create Checkout Sessions for a (user, plan) pair.
 *   - Verify + dispatch webhook events.
 *   - Cancel subscriptions at period end.
 *
 * The webhook handler is the source of truth for subscription state: we
 * never write to `subscriptions` from the synchronous /subscribe response
 * (the user hasn't paid yet at that point).
 */

import Stripe from 'stripe';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { subscriptions } from '../../shared/models/billing.js';
import { PLAN_CATALOGUE, type PlanDefinition } from './plans.js';

// `apiVersion` is left unset so the default pinned to the SDK major is used —
// forcing a value here tends to drift out of sync with the installed SDK.
let _client: Stripe | null = null;
function getClient(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  _client = new Stripe(key);
  return _client;
}

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function getOrigin(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    'https://hellomara.net'
  ).replace(/\/+$/, '');
}

/**
 * Resolve a Stripe Price for the given plan.
 *
 * Two modes, in priority order:
 *   1. Env var `STRIPE_PRICE_<PLAN_ID_UPPER>` — a Price ID pre-provisioned
 *      in the Stripe dashboard. Use this in production to get clean
 *      analytics + coupon support.
 *   2. Fallback: inline `price_data` with the plan's catalogue price +
 *      recurring interval. Gets you live immediately with zero Stripe
 *      dashboard setup, at the cost of per-session Price creation.
 */
function lineItemForPlan(plan: PlanDefinition): Stripe.Checkout.SessionCreateParams.LineItem {
  const envKey = `STRIPE_PRICE_${plan.id.toUpperCase()}`;
  const priceId = process.env[envKey];
  if (priceId) {
    return { price: priceId, quantity: 1 };
  }
  const interval: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring['interval'] =
    plan.period === 'yearly' ? 'year' : 'month';
  return {
    quantity: 1,
    price_data: {
      currency: plan.currency.toLowerCase(),
      unit_amount: plan.priceCents,
      recurring: { interval },
      product_data: {
        name: `MaraAI — ${plan.tier.toUpperCase()} (${plan.period})`,
      },
    },
  };
}

export interface CreateCheckoutParams {
  userId: string;
  userEmail: string | null;
  plan: PlanDefinition;
}

export async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<{ url: string; sessionId: string }> {
  if (plan_is_free(params.plan)) {
    throw new Error('free plans are not subscribable');
  }
  const stripe = getClient();
  const origin = getOrigin();

  // Reuse an existing Stripe customer if we already have one for this user —
  // this keeps the payment method on file and lets the Billing Portal work.
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, params.userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const existingCustomerId = existing[0]?.providerCustomerId ?? null;

  // Idempotency: if the user double-clicks "Subscribe", Stripe returns the
  // same Checkout Session instead of creating a duplicate. Key scoped per
  // (user, plan, minute) so a genuine retry after a transient 5xx still
  // succeeds on the next minute.
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `checkout:${params.userId}:${params.plan.id}:${minuteBucket}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: [lineItemForPlan(params.plan)],
      success_url: `${origin}/?subscribed=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?subscribed=0`,
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : params.userEmail
          ? { customer_email: params.userEmail }
          : {}),
      client_reference_id: params.userId,
      // `metadata` is echoed back on every webhook event; we use it to
      // reconnect the provider-side subscription to our user/plan without
      // a round-trip lookup by customer email.
      metadata: {
        userId: params.userId,
        planId: params.plan.id,
      },
      subscription_data: {
        metadata: {
          userId: params.userId,
          planId: params.plan.id,
        },
      },
      allow_promotion_codes: true,
    },
    { idempotencyKey },
  );

  if (!session.url) {
    throw new Error('stripe returned no checkout url');
  }
  return { url: session.url, sessionId: session.id };
}

function plan_is_free(p: PlanDefinition): boolean {
  return p.tier === 'free' || p.priceCents === 0;
}

/**
 * Verify + parse a webhook request. Throws if the signature is invalid —
 * route handler should 400.
 */
export function verifyWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET missing');
  const stripe = getClient();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Idempotent persistence of a subscription row from a Stripe event.
 *
 * Keyed on `providerSubscriptionId`. Create on first sight, update on
 * subsequent events (status changes, period renewals, cancellations). We
 * deliberately do not rely on `checkout.session.completed` alone because
 * Stripe's docs warn that its subscription object is not yet finalized
 * when that event fires.
 */
async function upsertSubscription(args: {
  stripeSub: Stripe.Subscription;
  userId: string;
  planId: string;
}): Promise<void> {
  const { stripeSub, userId, planId } = args;
  const now = new Date();
  const periodStart = stripeSub.current_period_start
    ? new Date(stripeSub.current_period_start * 1000)
    : now;
  const periodEnd = stripeSub.current_period_end
    ? new Date(stripeSub.current_period_end * 1000)
    : null;

  // Map Stripe statuses to our internal vocabulary so the UI doesn't need
  // to know about 'trialing', 'unpaid', etc.
  const status = mapStripeStatus(stripeSub.status, stripeSub.cancel_at_period_end);

  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, stripeSub.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(subscriptions)
      .set({
        status,
        planId,
        periodStart,
        periodEnd,
        cancelledAt: stripeSub.canceled_at
          ? new Date(stripeSub.canceled_at * 1000)
          : status === 'cancelled'
            ? existing[0].cancelledAt ?? now
            : null,
        providerCustomerId:
          typeof stripeSub.customer === 'string'
            ? stripeSub.customer
            : stripeSub.customer?.id ?? existing[0].providerCustomerId,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing[0].id));
    return;
  }

  // Before inserting a brand new row, demote any prior active rows for
  // the same user — a user can only have one active subscription at a
  // time and `getActivePlanId` picks the most recent one.
  await db
    .update(subscriptions)
    .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
      ),
    );

  await db.insert(subscriptions).values({
    userId,
    planId,
    status,
    provider: 'stripe',
    providerSubscriptionId: stripeSub.id,
    providerCustomerId:
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer?.id ?? null,
    periodStart,
    periodEnd,
    cancelledAt: stripeSub.canceled_at
      ? new Date(stripeSub.canceled_at * 1000)
      : null,
  });
}

function mapStripeStatus(
  status: Stripe.Subscription.Status,
  cancelAtPeriodEnd: boolean,
): 'active' | 'cancelled' | 'past_due' | 'incomplete' {
  // `cancel_at_period_end=true` means the sub is still active right now
  // but will lapse at periodEnd. We keep it as 'active' so feature-gating
  // continues to grant access until then.
  if (status === 'active' || status === 'trialing') return 'active';
  if (cancelAtPeriodEnd && status !== 'canceled') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled') return 'cancelled';
  return 'incomplete';
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const stripe = getClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Guard: only subscription-mode sessions reach us here.
      if (session.mode !== 'subscription' || !session.subscription) return;
      const userId =
        (session.metadata?.userId as string | undefined) ||
        (session.client_reference_id as string | null) ||
        null;
      const planId = session.metadata?.planId as string | undefined;
      if (!userId || !planId) {
        console.warn('[stripe] checkout.session.completed without userId/planId');
        return;
      }
      const subId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;
      const stripeSub = await stripe.subscriptions.retrieve(subId);
      await upsertSubscription({ stripeSub, userId, planId });
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const userId = stripeSub.metadata?.userId as string | undefined;
      const planId = stripeSub.metadata?.planId as string | undefined;
      if (!userId || !planId) {
        // Without metadata we have nothing to bind to an internal user.
        // This happens for subs created directly in the Stripe dashboard;
        // they are not our concern.
        return;
      }
      await upsertSubscription({ stripeSub, userId, planId });
      return;
    }

    default:
      // Ignore. Returning 200 tells Stripe we processed it; we only act
      // on the events above.
      return;
  }
}

/**
 * Cancel the user's active Stripe subscription at period end. Keeps access
 * granted until periodEnd and defers DB mutation to the webhook.
 */
export async function cancelUserSubscriptionAtPeriodEnd(
  providerSubscriptionId: string,
): Promise<void> {
  const stripe = getClient();
  await stripe.subscriptions.update(providerSubscriptionId, {
    cancel_at_period_end: true,
  });
}

export function planById(id: string): PlanDefinition | undefined {
  return PLAN_CATALOGUE.find((p) => p.id === id);
}
