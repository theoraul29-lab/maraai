// A/B Testing module for Mara Growth Experiments
//
// Each experiment gets a 50/50 split based on a deterministic hash of
// (userId + experimentId) so the same user always lands in the same variant
// across sessions and server restarts. Assignments are persisted in ab_tests
// for analytics.

import { rawSqlite } from '../db.js';

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/**
 * Assign a user to a variant for an experiment.
 * Idempotent — returns the existing assignment if one already exists.
 * Uses a deterministic integer hash so the split is reproducible even
 * before the assignment row exists (useful for read-only previews).
 */
export function assignVariant(
  userId: string,
  experimentId: string,
): 'control' | 'treatment' {
  const existing = rawSqlite
    .prepare(`SELECT variant FROM ab_tests WHERE experiment_id = ? AND user_id = ? LIMIT 1`)
    .get(String(experimentId), userId) as { variant: string } | undefined;

  if (existing) return existing.variant as 'control' | 'treatment';

  // Deterministic hash: consistent across restarts, no randomness
  const key = userId + '|' + String(experimentId);
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  }
  const variant: 'control' | 'treatment' = hash % 2 === 0 ? 'control' : 'treatment';

  try {
    rawSqlite
      .prepare(
        `INSERT OR IGNORE INTO ab_tests (id, experiment_id, user_id, variant)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?)`,
      )
      .run(String(experimentId), userId, variant);
  } catch {
    // Race condition — row inserted concurrently; just return computed variant
  }

  return variant;
}

/**
 * Returns true if the user is in the treatment group for this experiment.
 * Safe to call on every request — assignment is cached in DB.
 */
export function shouldShowTreatment(userId: string, experimentId: string): boolean {
  return assignVariant(userId, experimentId) === 'treatment';
}

// ---------------------------------------------------------------------------
// Conversion tracking
// ---------------------------------------------------------------------------

/** Record that a user converted (completed the action the experiment targets). */
export function recordConversion(userId: string, experimentId: string): void {
  try {
    rawSqlite
      .prepare(
        `UPDATE ab_tests SET converted = 1, converted_at = unixepoch()
         WHERE experiment_id = ? AND user_id = ? AND converted = 0`,
      )
      .run(String(experimentId), userId);
  } catch {
    /* non-fatal */
  }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface ABTestResults {
  control: { users: number; conversions: number; rate: number };
  treatment: { users: number; conversions: number; rate: number };
  winner: 'control' | 'treatment' | 'inconclusive';
  /** Simplified confidence score 0-95. Not a rigorous p-value. */
  confidence: number;
  /** Relative % improvement of treatment over control. Negative = regression. */
  improvement: number;
  totalUsers: number;
}

export function getABTestResults(experimentId: string): ABTestResults {
  const rows = rawSqlite
    .prepare(
      `SELECT variant, COUNT(*) as users, COALESCE(SUM(converted), 0) as conversions
       FROM ab_tests WHERE experiment_id = ?
       GROUP BY variant`,
    )
    .all(String(experimentId)) as Array<{
    variant: string;
    users: number;
    conversions: number;
  }>;

  const ctrlRow = rows.find((r) => r.variant === 'control') ?? { users: 0, conversions: 0 };
  const treatRow = rows.find((r) => r.variant === 'treatment') ?? { users: 0, conversions: 0 };

  const ctrlRate = ctrlRow.users > 0 ? ctrlRow.conversions / ctrlRow.users : 0;
  const treatRate = treatRow.users > 0 ? treatRow.conversions / treatRow.users : 0;
  const improvement =
    ctrlRate > 0 ? Math.round(((treatRate - ctrlRate) / ctrlRate) * 1000) / 10 : 0;

  // Heuristic confidence: effect size × sample weight, capped at 95
  const totalUsers = ctrlRow.users + treatRow.users;
  const confidence = Math.min(95, Math.round(Math.abs(improvement) * 1.5 + totalUsers * 0.4));

  let winner: 'control' | 'treatment' | 'inconclusive' = 'inconclusive';
  if (confidence >= 80) {
    winner = treatRate > ctrlRate ? 'treatment' : 'control';
  }

  return {
    control: {
      users: ctrlRow.users,
      conversions: ctrlRow.conversions,
      rate: Math.round(ctrlRate * 100),
    },
    treatment: {
      users: treatRow.users,
      conversions: treatRow.conversions,
      rate: Math.round(treatRate * 100),
    },
    winner,
    confidence,
    improvement,
    totalUsers,
  };
}

/** Returns true if at least one user has been assigned to this experiment. */
export function hasABData(experimentId: string): boolean {
  const row = rawSqlite
    .prepare(`SELECT COUNT(*) as cnt FROM ab_tests WHERE experiment_id = ?`)
    .get(String(experimentId)) as { cnt: number };
  return (row?.cnt ?? 0) > 0;
}
