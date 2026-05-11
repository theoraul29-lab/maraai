// Mara Credits — internal economy.
//
// Users earn credits by contributing to the P2P mesh (compute on desktop,
// bandwidth on mobile) and spend them on premium features. The ledger is
// append-only (`credit_transactions`) and the running balance is
// materialised in `user_credits` for cheap reads.
//
// All write paths are idempotent on (userId, idempotencyKey) so retried
// WebSocket jobs, duplicate signup events, etc. never double-credit.
//
// HARD CONSTRAINTS:
//   * Awards are server-authoritative. Clients never assert their balance —
//     they only emit events ("I completed job X") and the server decides if
//     and how much credit to grant.
//   * Idempotency keys MUST be opaque and unguessable to the client when
//     they encode a server-issued resource (e.g. WebSocket job id), so a
//     malicious peer can't replay an old award.

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creditTransactions,
  userCredits,
  type CreditTransaction,
  type UserCredits,
} from '../../shared/schema.js';
import { logActivity } from './activity.js';

/**
 * Canonical reasons for credit movements. Used by the server only — clients
 * never pass a reason in. Adding a new reason here is intentionally a code
 * change so we can audit the full surface area of award sources.
 */
export const CREDIT_REASONS = {
  /** First-time activation of the desktop P2P node (Ollama compute). */
  SIGNUP_BONUS_DESKTOP: 'signup_bonus_desktop',
  /** First-time activation of the mobile P2P node (bandwidth seeding). */
  SIGNUP_BONUS_MOBILE: 'signup_bonus_mobile',
  /** Successfully completed an LLM job for another user via Ollama. */
  P2P_COMPUTE_JOB: 'p2p_compute_job',
  /** Seeded N MB of P2P video bandwidth (rounded down to nearest 100 MB). */
  P2P_VIDEO_SEED: 'p2p_video_seed',
  /** Manual award by an admin (e.g. compensation, contest, refund). */
  ADMIN_GRANT: 'admin_grant',
  /** Spent credits unlocking a premium feature. */
  SPEND_PREMIUM: 'spend_premium',
} as const;

export type CreditReason = (typeof CREDIT_REASONS)[keyof typeof CREDIT_REASONS];

/** Default award amounts, in credits. */
export const CREDIT_AMOUNTS = {
  signupBonusDesktop: 50,
  signupBonusMobile: 20,
  /** Per successfully completed P2P compute job. */
  p2pComputeJob: 10,
  /** Per 100 MB of seeded video bandwidth. */
  p2pVideoSeedPer100Mb: 1,
} as const;

export type AwardInput = {
  userId: string;
  delta: number;
  reason: CreditReason;
  /**
   * Optional. When set, repeated calls with the same (userId, idempotencyKey)
   * are no-ops. Use the WebSocket job id, signup event id, etc.
   */
  idempotencyKey?: string;
  /** Optional. JSON-serialisable extra context, capped to 4 KB. */
  meta?: Record<string, unknown>;
};

export type CreditBalance = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
};

/** Read the current balance + lifetime totals. Always returns a row even for new users. */
export async function getBalance(userId: string): Promise<CreditBalance> {
  const row = (
    await db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1)
  )[0];
  if (!row) {
    return { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 };
  }
  return {
    balance: row.balance,
    lifetimeEarned: row.lifetimeEarned,
    lifetimeSpent: row.lifetimeSpent,
  };
}

export type HistoryEntry = {
  id: number;
  delta: number;
  reason: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

/** Read the most recent N transactions for a user. */
export async function getHistory(userId: string, limit = 50): Promise<HistoryEntry[]> {
  const rows: CreditTransaction[] = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));
  return rows.map((r) => ({
    id: r.id,
    delta: r.delta,
    reason: r.reason,
    meta: safeParseMeta(r.meta),
    createdAt: toIsoTimestamp(r.createdAt),
  }));
}

/**
 * Award (positive delta) or spend (negative delta) credits. Returns the
 * updated balance. Idempotent on (userId, idempotencyKey) — retries with
 * the same key resolve to the existing transaction.
 */
export async function awardCredits(input: AwardInput): Promise<CreditBalance> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error('awardCredits: delta must be a non-zero integer');
  }
  if (!input.userId) throw new Error('awardCredits: userId is required');

  // Idempotency check — we don't rely on the unique index because we want a
  // clean "no-op" return (not a thrown SQLITE_CONSTRAINT). The unique index
  // remains as a defence-in-depth guard against races.
  if (input.idempotencyKey) {
    const existing = (
      await db
        .select()
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, input.userId),
            eq(creditTransactions.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      return getBalance(input.userId);
    }
  }

  const meta = JSON.stringify(input.meta ?? {});
  if (meta.length > 4096) {
    throw new Error('awardCredits: meta exceeds 4 KB');
  }

  // Two-step write: insert ledger entry, then upsert the materialised total.
  // SQLite's better-sqlite3 driver runs sync so this is effectively atomic
  // within a single tick; the unique index on idempotencyKey backstops the
  // race where two concurrent ticks both passed the existence check above.
  try {
    await db.insert(creditTransactions).values({
      userId: input.userId,
      delta: input.delta,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey ?? null,
      meta,
    });
  } catch (err) {
    if (isUniqueConstraint(err)) {
      // Another concurrent caller won the race — return the existing balance.
      return getBalance(input.userId);
    }
    throw err;
  }

  const existingBalance = (
    await db.select().from(userCredits).where(eq(userCredits.userId, input.userId)).limit(1)
  )[0];

  const earnedDelta = input.delta > 0 ? input.delta : 0;
  const spentDelta = input.delta < 0 ? -input.delta : 0;

  if (existingBalance) {
    const next: Partial<UserCredits> = {
      balance: existingBalance.balance + input.delta,
      lifetimeEarned: existingBalance.lifetimeEarned + earnedDelta,
      lifetimeSpent: existingBalance.lifetimeSpent + spentDelta,
      updatedAt: new Date(),
    };
    await db.update(userCredits).set(next).where(eq(userCredits.userId, input.userId));
  } else {
    await db.insert(userCredits).values({
      userId: input.userId,
      balance: input.delta,
      lifetimeEarned: earnedDelta,
      lifetimeSpent: spentDelta,
    });
  }

  await logActivity(input.userId, 'credits.changed', {
    delta: input.delta,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  return getBalance(input.userId);
}

/**
 * One-time signup bonus when a user activates the P2P background node for
 * the first time. Idempotent per (userId, deviceKind) — toggling P2P off
 * and back on does NOT re-award credits.
 */
export async function awardActivationBonus(
  userId: string,
  deviceKind: 'desktop' | 'mobile',
): Promise<CreditBalance | null> {
  const reason =
    deviceKind === 'desktop'
      ? CREDIT_REASONS.SIGNUP_BONUS_DESKTOP
      : CREDIT_REASONS.SIGNUP_BONUS_MOBILE;
  const delta =
    deviceKind === 'desktop'
      ? CREDIT_AMOUNTS.signupBonusDesktop
      : CREDIT_AMOUNTS.signupBonusMobile;

  return awardCredits({
    userId,
    delta,
    reason,
    idempotencyKey: `${reason}:${userId}`,
    meta: { deviceKind },
  });
}

/**
 * Drizzle's better-sqlite3 timestamp mode returns `Date` for rows it just
 * inserted and the raw integer (seconds since epoch) for rows read back
 * via SELECT. Normalise both to an ISO string so callers get a stable
 * shape.
 */
function toIsoTimestamp(v: unknown): string {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : new Date(0).toISOString();
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Drizzle stores `mode: 'timestamp'` as seconds — see the existing
    // `lastSeenAt` handling in p2p.ts:rowToView for the same pattern.
    return new Date(v * 1000).toISOString();
  }
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return new Date(0).toISOString();
}

function safeParseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isUniqueConstraint(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT';
}
