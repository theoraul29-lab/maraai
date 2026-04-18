/**
 * Feature gating for MaraAI.
 *
 * Every user-facing capability that varies across plans is identified by a
 * stable string key (e.g. `writers.publish_vip`). Plans grant a set of keys
 * (see `plans.ts`) and route handlers ask `hasFeature(userId, key)` to
 * decide whether to allow a request. An anonymous user always resolves to
 * the `free` tier's scope — they can still watch reels and read public
 * articles without an account.
 *
 * Downstream PRs (Writers Hub, Trading Academy, Creator Tools) wire their
 * endpoints through the `requireFeature()` middleware exported here.
 */

import type { Request, Response, NextFunction } from 'express';
import { eq, and, or, gt, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { plans, subscriptions } from '../../shared/models/billing.js';
import { PLAN_CATALOGUE } from './plans.js';

// ---------------------------------------------------------------------------
// Known feature keys. Keeping the union explicit gives us type safety at the
// call sites (no typos survive `tsc`) and lets the seeder verify that every
// key referenced in `plans.ts` is a member of this set.
// ---------------------------------------------------------------------------
export const FEATURE_KEYS = [
  // chat
  'chat.basic',
  'chat.unlimited',
  'chat.custom_personality',
  // reels
  'reels.watch',
  'reels.upload',
  'reels.hd',
  'reels.monetize',
  // writers
  'writers.read_public',
  'writers.read_vip',
  'writers.publish_public',
  'writers.publish_vip',
  'writers.publish_paid',
  // trading academy
  'trading.level_1_fundamentals',
  'trading.all_levels',
  'trading.live_sessions',
  // profile
  'profile.public',
  // creator tools
  'creator.revenue_share',
  'creator.payouts',
  'creator.analytics',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);

/**
 * Validate the plan catalogue at module load time so any typo in `plans.ts`
 * fails fast during server boot rather than at the first `hasFeature` call.
 */
export function validatePlanCatalogue(): void {
  for (const plan of PLAN_CATALOGUE) {
    for (const key of plan.features) {
      if (!FEATURE_KEY_SET.has(key)) {
        throw new Error(
          `[billing] Plan "${plan.id}" references unknown feature key "${key}". ` +
            `Add it to FEATURE_KEYS in server/billing/features.ts.`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Runtime lookup: does the given user currently have this feature?
// ---------------------------------------------------------------------------

/**
 * Derive the active plan id for a user. Anonymous users (null userId) and
 * users without an active subscription get `free`. A subscription grants
 * access while its status is `active`, OR while it is `cancelled` with a
 * concrete `periodEnd` still in the future — so a user who cancels mid-cycle
 * keeps paid features until the period they already paid for expires. A
 * cancelled subscription with no `periodEnd` grants no access (defence in
 * depth against rows where the provider never reported a period end).
 */
export async function getActivePlanId(userId: string | null): Promise<string> {
  if (!userId) return 'free';

  const now = new Date();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        or(
          eq(subscriptions.status, 'active'),
          and(
            eq(subscriptions.status, 'cancelled'),
            gt(subscriptions.periodEnd, now),
          ),
        ),
      ),
    )
    // Deterministic tie-break: if a user somehow has more than one
    // qualifying row (e.g. an active sub plus an older cancelled one with
    // a future periodEnd), pick the most recently created. Without this
    // SQLite returns an arbitrary row which could flip between requests.
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  return rows[0]?.planId ?? 'free';
}

/** Whether the user (or anonymous session) has access to the given feature. */
export async function hasFeature(
  userId: string | null,
  key: FeatureKey,
): Promise<boolean> {
  const planId = await getActivePlanId(userId);

  // Prefer the in-memory catalogue for speed; fall back to DB for plans
  // that might have been added dynamically (future-proofing).
  const catalogued = PLAN_CATALOGUE.find((p) => p.id === planId);
  if (catalogued) {
    return (catalogued.features as readonly string[]).includes(key);
  }

  const [row] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!row) return false;
  try {
    const arr = JSON.parse(row.features) as string[];
    return arr.includes(key);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Express middleware wrapper. Routes opt in with:
//   app.post('/api/writers', requireFeature('writers.publish_public'), handler)
// ---------------------------------------------------------------------------
export function requireFeature(key: FeatureKey) {
  return async function featureGate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const userId = (req.session as { userId?: string } | undefined)?.userId ?? null;
    const allowed = await hasFeature(userId, key);
    if (!allowed) {
      res.status(403).json({
        error: 'feature_not_available',
        feature: key,
        message:
          'This feature requires an upgraded plan. Visit /billing to upgrade.',
      });
      return;
    }
    next();
  };
}
