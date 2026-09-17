/**
 * Canonical plan catalogue.
 *
 * Single source of truth for pricing + feature scope. The seeder
 * (`seed.ts`) upserts these rows into the `plans` table on every boot so the
 * runtime and DB stay in sync as we tweak prices / features.
 *
 * Prices are in **euro cents**. One row per (tier, period) pair.
 *
 * Feature keys are validated against `features.ts#FEATURE_KEYS` at boot —
 * typos fail loudly instead of silently granting nothing.
 */

export type PlanTier = 'free' | 'vip';
export type PlanPeriod = 'monthly' | 'yearly' | 'none';

export interface PlanDefinition {
  id: string;
  tier: PlanTier;
  period: PlanPeriod;
  priceCents: number;
  currency: 'EUR';
  features: readonly string[];
}

// Programs are accessible to all users — the daily progression mechanic
// (1 mission/day) is the natural pacing, not a paywall.
//
// Writers Hub is fully open too: writing, publishing (including setting a
// price and selling) never required VIP as a deliberate choice — anyone
// with an account can write, publish, and sell if they choose to.
// writers.read_vip/writers.publish_vip are kept only so existing articles
// published under the old VIP-exclusive-readership tier keep working
// (nobody is newly offered that visibility — see WritersHub.tsx's
// composer, which only presents public/paid now); they're just no longer
// gated behind a paid plan.
const FREE_FEATURES = [
  'chat.basic',
  'reels.watch',
  'writers.read_public',
  'writers.read_vip',
  'writers.publish_public',
  'writers.publish_vip',
  'writers.publish_paid',
  'programs.all',
] as const;

// VIP unlocks unlimited/premium AI and reels creation. Writers Hub access
// (above) is the same for every plan.
const VIP_FEATURES = [
  ...FREE_FEATURES,
  'chat.unlimited',
  'chat.custom_personality',
  'reels.upload',
  'reels.hd',
  'reels.monetize',
  'profile.public',
  'creator.revenue_share',
  'creator.payouts',
  'creator.analytics',
] as const;

/**
 * Canonical plan list — Explorer (free) and VIP only.
 * Order controls rendering on the pricing page.
 */
export const PLAN_CATALOGUE: readonly PlanDefinition[] = [
  {
    id: 'free',
    tier: 'free',
    period: 'none',
    priceCents: 0,
    currency: 'EUR',
    features: FREE_FEATURES,
  },
  {
    id: 'vip_monthly',
    tier: 'vip',
    period: 'monthly',
    priceCents: 2100, // €21.00/month
    currency: 'EUR',
    features: VIP_FEATURES,
  },
] as const;

/**
 * Writers Hub revenue share: the author keeps 90%, the platform keeps 10%.
 * Only server/modules/writers.ts actually applies this today — it's not a
 * platform-wide creator constant despite the generic name (reels
 * monetization doesn't read it; see the module comment there).
 */
export const CREATOR_REVENUE_SHARE = 0.9;

// ─── Program catalogue ────────────────────────────────────────────────────────

export type ProgramId =
  | 'new_mindset'
  | 'new_habit'
  | 'new_skills'
  | 'new_body'
  | 'new_life'
  | 'new_you';

export interface ProgramDefinition {
  id: ProgramId;
  name: string;
  durationDays: number;
  /** 0 = free for every registered account. Otherwise a one-time unlock price. */
  priceCents: number;
}

// New Mindset + New Habit are the free on-ramp (~22 days combined) — enough
// to feel the daily mission rhythm before any payment. Each program after
// that is a flat, cheap one-time unlock (not scaled by length — New You is
// 1095 days for the same €8 as the 90-day New Skills) so the price is never
// the reason someone stops; see PROGRAM_BUNDLE for unlocking all four at
// once, and TRANSFORMATION_BOOK for the paid PDF at the end of New You.
//
// Buying out of order (e.g. New Life without already owning New Skills and
// New Body) is not a way to skip paying for the earlier ones — the purchase
// endpoint expands the request to include every missing earlier-in-sequence
// program automatically (see programs.ts#expandWithPrerequisites), charged
// together in the same checkout. Paying in order, one at a time, stays €8
// each; jumping ahead costs the sum of everything missing up to that point.
export const PROGRAM_CATALOGUE: readonly ProgramDefinition[] = [
  { id: 'new_mindset', name: 'New Mindset', durationDays: 1,    priceCents: 0 },
  { id: 'new_habit',   name: 'New Habit',   durationDays: 21,   priceCents: 0 },
  { id: 'new_skills',  name: 'New Skills',  durationDays: 90,   priceCents: 800 },
  { id: 'new_body',    name: 'New Body',    durationDays: 180,  priceCents: 800 },
  { id: 'new_life',    name: 'New Life',    durationDays: 365,  priceCents: 800 },
  { id: 'new_you',     name: 'New You',     durationDays: 1095, priceCents: 800 },
] as const;

// Order here IS the progression/purchase sequence — server/billing/
// programs.ts's expandWithPrerequisites() reads this array's order
// directly, so this list must stay in new_skills -> new_body -> new_life
// -> new_you order (already true; called out explicitly since it's now
// load-bearing for billing logic, not just display order).

/** Unlocks New Skills + New Body + New Life + New You in one purchase (vs. €8 × 4 à la carte). */
export const PROGRAM_BUNDLE = {
  id: 'bundle_all_programs',
  name: 'All Programs Bundle',
  priceCents: 2900,
  includes: ['new_skills', 'new_body', 'new_life', 'new_you'] as const,
} as const;

/** The personalized PDF book compiled from a user's New You journal, sold once they complete it. */
export const TRANSFORMATION_BOOK = {
  id: 'book_new_you',
  name: 'Your Transformation Book (PDF)',
  priceCents: 5100,
  requiresProgram: 'new_you' as const,
} as const;

export type PurchasableItemId =
  | ProgramId
  | typeof PROGRAM_BUNDLE.id
  | typeof TRANSFORMATION_BOOK.id;
