/**
 * PayPal Subscriptions integration (Phase 2 P2.0.2).
 *
 * Mirrors the shape of `stripe.ts`:
 *   - createSubscription → returns approval { url, orderId } for the frontend
 *     to redirect.
 *   - verifyWebhookEvent → calls PayPal's verify-signature endpoint.
 *   - handlePayPalEvent → idempotent upsert into our `subscriptions` table.
 *   - cancelSubscription → POSTs /subscriptions/{id}/cancel.
 *
 * We do NOT use the @paypal/* npm SDKs — they pull a lot of transitive
 * dependencies for what is ultimately 4 REST calls. A minimal fetch-based
 * wrapper keeps the attack surface tight and the build fast.
 */

import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { subscriptions } from '../../shared/models/billing.js';
import { PLAN_CATALOGUE, type PlanDefinition } from './plans.js';

interface PayPalAuthToken {
  access_token: string;
  expires_at: number; // epoch ms
}

let _token: PayPalAuthToken | null = null;

function apiBase(): string {
  return process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

export function isPayPalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  if (_token && _token.expires_at > Date.now() + 30_000) {
    return _token.access_token;
  }
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PayPal credentials not configured');
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`PayPal oauth2 failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _token = {
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

async function paypalFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  if (init.idempotencyKey) {
    // PayPal calls this "PayPal-Request-Id". Same contract as Stripe's
    // Idempotency-Key: re-sending the same key returns the same result.
    headers.set('PayPal-Request-Id', init.idempotencyKey);
  }
  return fetch(`${apiBase()}${path}`, { ...init, headers });
}

function getOrigin(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    'https://hellomara.net'
  ).replace(/\/+$/, '');
}

/**
 * Resolve a PayPal plan id for one of our catalogue plans. PayPal does not
 * support ad-hoc price-on-the-fly for subscriptions, so an operator must
 * pre-create the plans in the PayPal dashboard and expose the ids as env
 * vars `PAYPAL_PLAN_<PLAN_ID_UPPER>`.
 */
function paypalPlanIdFor(plan: PlanDefinition): string | null {
  return process.env[`PAYPAL_PLAN_${plan.id.toUpperCase()}`] ?? null;
}

export interface CreatePayPalSubscriptionParams {
  userId: string;
  userEmail: string | null;
  plan: PlanDefinition;
}

/**
 * Create a PayPal subscription in the "APPROVAL_PENDING" state and return
 * the approval URL. The frontend redirects the user to this URL; PayPal
 * redirects back to `return_url` on success and we rely on the webhook to
 * persist the subscription.
 */
export async function createPayPalSubscription(
  params: CreatePayPalSubscriptionParams,
): Promise<{ url: string; subscriptionId: string }> {
  const planId = paypalPlanIdFor(params.plan);
  if (!planId) {
    throw new Error(
      `PAYPAL_PLAN_${params.plan.id.toUpperCase()} is not set — pre-create the billing plan in PayPal and expose its id as this env var`,
    );
  }
  const origin = getOrigin();
  // Minute-bucket idempotency — same contract as Stripe's.
  const idemBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `paypal:sub:${params.userId}:${params.plan.id}:${idemBucket}`;

  const body = {
    plan_id: planId,
    custom_id: `${params.userId}:${params.plan.id}`,
    subscriber: params.userEmail
      ? { email_address: params.userEmail }
      : undefined,
    application_context: {
      brand_name: 'MaraAI',
      user_action: 'SUBSCRIBE_NOW',
      return_url: `${origin}/?subscribed=1&provider=paypal`,
      cancel_url: `${origin}/?subscribed=0&provider=paypal`,
    },
  };

  const res = await paypalFetch('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify(body),
    idempotencyKey,
  });
  if (!res.ok) {
    throw new Error(`PayPal createSubscription failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    id: string;
    links?: Array<{ href: string; rel: string }>;
  };
  const approve = json.links?.find((l) => l.rel === 'approve');
  if (!approve?.href) throw new Error('PayPal returned no approval link');
  return { url: approve.href, subscriptionId: json.id };
}

export async function cancelPayPalSubscription(
  providerSubscriptionId: string,
  reason = 'User requested cancellation',
): Promise<void> {
  const res = await paypalFetch(
    `/v1/billing/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`PayPal cancel failed: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

export interface PayPalWebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
}

export function readWebhookHeaders(h: Record<string, unknown>): PayPalWebhookHeaders | null {
  const pick = (k: string) => {
    const v = h[k] ?? h[k.toLowerCase()];
    return typeof v === 'string' ? v : null;
  };
  const transmissionId = pick('paypal-transmission-id');
  const transmissionTime = pick('paypal-transmission-time');
  const certUrl = pick('paypal-cert-url');
  const authAlgo = pick('paypal-auth-algo');
  const transmissionSig = pick('paypal-transmission-sig');
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return null;
  }
  return { transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig };
}

/**
 * Call PayPal's verify-webhook-signature endpoint. Returns true iff PayPal
 * responds with `verification_status: SUCCESS`.
 */
export async function verifyWebhookEvent(
  rawBody: string,
  headers: PayPalWebhookHeaders,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error('PAYPAL_WEBHOOK_ID is not configured');
  }
  // PayPal's verify endpoint wants the event body as a parsed object, not a
  // string. We pre-parse to catch invalid-JSON payloads up front.
  let parsedEvent: unknown;
  try {
    parsedEvent = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const res = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      transmission_id: headers.transmissionId,
      transmission_time: headers.transmissionTime,
      cert_url: headers.certUrl,
      auth_algo: headers.authAlgo,
      transmission_sig: headers.transmissionSig,
      webhook_id: webhookId,
      webhook_event: parsedEvent,
    }),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === 'SUCCESS';
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

type PayPalSubscriptionResource = {
  id: string;
  status?: string;
  plan_id?: string;
  custom_id?: string;
  start_time?: string;
  billing_info?: {
    next_billing_time?: string;
  };
  subscriber?: { payer_id?: string };
};

interface PayPalEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  resource?: PayPalSubscriptionResource;
}

function mapPayPalStatus(
  status: string | undefined,
): 'active' | 'cancelled' | 'past_due' | 'incomplete' {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'active';
    case 'APPROVAL_PENDING':
    case 'APPROVED':
      return 'incomplete';
    case 'SUSPENDED':
      return 'past_due';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'cancelled';
    default:
      return 'incomplete';
  }
}

async function upsertSubscription(args: {
  resource: PayPalSubscriptionResource;
  userId: string;
  planId: string;
}): Promise<void> {
  const { resource, userId, planId } = args;
  const now = new Date();
  const periodStart = resource.start_time ? new Date(resource.start_time) : now;
  const periodEnd = resource.billing_info?.next_billing_time
    ? new Date(resource.billing_info.next_billing_time)
    : null;
  const status = mapPayPalStatus(resource.status);

  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, resource.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(subscriptions)
      .set({
        status,
        planId,
        periodStart,
        periodEnd,
        cancelledAt: status === 'cancelled' ? existing[0].cancelledAt ?? now : null,
        providerCustomerId: resource.subscriber?.payer_id ?? existing[0].providerCustomerId,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing[0].id));
    return;
  }

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
    provider: 'paypal',
    providerSubscriptionId: resource.id,
    providerCustomerId: resource.subscriber?.payer_id ?? null,
    periodStart,
    periodEnd,
    cancelledAt: status === 'cancelled' ? now : null,
  });
}

/**
 * Parse our `(userId, planId)` pair from the PayPal subscription resource.
 * We stash it into `custom_id` on creation so every webhook event carries
 * it through without a lookup.
 */
function parseCustomId(resource: PayPalSubscriptionResource): { userId: string; planId: string } | null {
  const raw = resource.custom_id;
  if (!raw || typeof raw !== 'string') return null;
  const [userId, planId] = raw.split(':');
  if (!userId || !planId) return null;
  if (!PLAN_CATALOGUE.find((p) => p.id === planId)) return null;
  return { userId, planId };
}

export async function handlePayPalEvent(event: PayPalEvent): Promise<void> {
  if (!event.resource) return;
  const binding = parseCustomId(event.resource);
  if (!binding) {
    // Subscriptions created outside of our flow (e.g. directly in the
    // dashboard) won't have custom_id — ignore them.
    return;
  }
  switch (event.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.CREATED':
    case 'BILLING.SUBSCRIPTION.UPDATED':
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
      await upsertSubscription({
        resource: event.resource,
        userId: binding.userId,
        planId: binding.planId,
      });
      return;
    default:
      return;
  }
}

export async function latestPayPalSubscriptionForUser(
  userId: string,
): Promise<{ id: string; providerSubscriptionId: string | null } | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row || row.provider !== 'paypal') return null;
  return { id: row.id, providerSubscriptionId: row.providerSubscriptionId };
}
