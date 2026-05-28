/**
 * Canonical plan catalogue.
 *
 * Single source of truth for pricing + feature scope. The seeder
 * (`seed.ts`) upserts these rows into the `plans` table on every boot so the
 * runtime and DB stay in sync as we tweak prices / features.
 *
 * Prices are in **euro cents**. One row per (tier, period) pair so the
 * foreign key from `subscriptions.plan_id` points at an immutable offering.
 *
 * Feature keys are validated against `features.ts#FEATURE_KEYS` at boot —
 * typos fail loudly instead of silently granting nothing.
 */

export type PlanTier = 'free' | 'trial' | 'pro' | 'vip' | 'creator';
export type PlanPeriod = 'monthly' | 'yearly' | 'none'; // 'yearly' kept for existing DB rows; no new yearly plans are offered

export interface PlanDefinition {
  id: string;
  tier: PlanTier;
  period: PlanPeriod;
  priceCents: number;
  currency: 'EUR';
  features: readonly string[];
}

/**
 * Feature scope by tier. Yearly plans inherit the monthly scope; we express
 * scope once per tier and spread it into both periods below.
 */
const FREE_FEATURES = [
  'chat.basic',
  'reels.watch',
  'writers.read_public',
] as const;

const PRO_FEATURES = [
  ...FREE_FEATURES,
  'chat.unlimited',
  'writers.publish_public',
  'reels.upload',
  'profile.public',
] as const;

const VIP_FEATURES = [
  ...PRO_FEATURES,
  'writers.read_vip',
  'writers.publish_vip',
  'chat.custom_personality',
  'reels.hd',
  'programs.all',
] as const;

const CREATOR_FEATURES = [
  ...VIP_FEATURES,
  'creator.revenue_share',
  'creator.payouts',
  'creator.analytics',
  'writers.publish_paid',
  'reels.monetize',
] as const;

/**
 * Canonical plan list. Order matters: it's the order we render on the
 * pricing page and the order we serialise in `GET /api/billing/plans`.
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
    // 1-hour trial granted on every new signup. Same feature scope as pro.
    id: 'trial',
    tier: 'trial',
    period: 'none',
    priceCents: 0,
    currency: 'EUR',
    features: PRO_FEATURES,
  },
  {
    id: 'pro_monthly',
    tier: 'pro',
    period: 'monthly',
    priceCents: 1600, // €16.00/lună
    currency: 'EUR',
    features: PRO_FEATURES,
  },
  {
    id: 'vip_monthly',
    tier: 'vip',
    period: 'monthly',
    priceCents: 2000, // €20.00/lună — include toate programele
    currency: 'EUR',
    features: VIP_FEATURES,
  },
  {
    id: 'creator_monthly',
    tier: 'creator',
    period: 'monthly',
    priceCents: 1699, // €16.99/lună — ⚠️ sub VIP, de confirmat preț
    currency: 'EUR',
    features: CREATOR_FEATURES,
  },
] as const;

/** Creator revenue share (creator keeps 70%, platform keeps 30%). */
export const CREATOR_REVENUE_SHARE = 0.7;

// ─── Program catalogue (included with VIP) ────────────────────────────────────

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
