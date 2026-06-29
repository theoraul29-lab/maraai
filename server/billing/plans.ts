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
const FREE_FEATURES = [
  'chat.basic',
  'reels.watch',
  'writers.read_public',
  'programs.all',
] as const;

// VIP unlocks all creation, monetization, and premium AI features.
const VIP_FEATURES = [
  ...FREE_FEATURES,
  'chat.unlimited',
  'writers.publish_public',
  'writers.read_vip',
  'writers.publish_vip',
  'writers.publish_paid',
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
    priceCents: 2000, // €20.00/month
    currency: 'EUR',
    features: VIP_FEATURES,
  },
] as const;

/** Creator revenue share (creator keeps 70%, platform keeps 30%). */
export const CREATOR_REVENUE_SHARE = 0.7;

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
}

export const PROGRAM_CATALOGUE: readonly ProgramDefinition[] = [
  { id: 'new_mindset', name: 'New Mindset', durationDays: 1 },
  { id: 'new_habit',   name: 'New Habit',   durationDays: 21 },
  { id: 'new_skills',  name: 'New Skills',  durationDays: 90 },
  { id: 'new_body',    name: 'New Body',    durationDays: 180 },
  { id: 'new_life',    name: 'New Life',    durationDays: 365 },
  { id: 'new_you',     name: 'New You',     durationDays: 1095 },
] as const;
