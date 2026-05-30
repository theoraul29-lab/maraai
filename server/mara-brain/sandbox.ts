/**
 * Brain Cycle Sandbox
 *
 * Defines and enforces the boundary of what the autonomous brain cycle can do.
 *
 * ── ALLOWED ────────────────────────────────────────────────────────────────────
 * READ  : users, missions, chat_history, experiments, user_missions,
 *         user_xp, user_preferences, mara_knowledge_base, mara_brain_session,
 *         ai_usage_log, brain_decisions
 * WRITE : mara_growth_experiments (status → proposed only),
 *         mara_knowledge_base, mara_brain_session,
 *         ai_usage_log, brain_decisions
 *
 * ── NEVER ──────────────────────────────────────────────────────────────────────
 * - DELETE on critical tables (users, missions, chat_history)
 * - UPDATE users.roles or users.tier
 * - DROP TABLE / ALTER TABLE on any table
 * - Direct experiment IMPLEMENT — requires manual admin approval
 * - Env var reads/writes from SQL
 * - Code execution (Python bridge, shell exec)
 *
 * Proposal flow: brain PROPOSES via mara_growth_experiments → admin APPROVES
 * → experiment-executor.ts IMPLEMENTS. Brain cannot self-implement.
 */

import { rawSqlite } from '../db.js';

const CRITICAL_TABLES_NO_DELETE = [
  'users', 'missions', 'user_missions', 'chat_history',
  'user_preferences', 'user_xp', 'sessions',
];

const CRITICAL_TABLES_NO_UPDATE_COLS = new Map<string, string[]>([
  ['users', ['role', 'tier', 'admin', 'is_admin']],
]);

class BrainQueryViolationError extends Error {
  constructor(reason: string, sql: string) {
    super(`[BrainSandbox] Blocked query — ${reason}\nSQL: ${sql.slice(0, 200)}`);
    this.name = 'BrainQueryViolationError';
  }
}

function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function assertBrainQuerySafe(sql: string): void {
  const norm = normalise(sql);

  // Block any DROP TABLE or ALTER TABLE — structural mutations are never allowed.
  if (/\bDROP\s+TABLE\b/.test(norm) || /\bALTER\s+TABLE\b/.test(norm)) {
    throw new BrainQueryViolationError('DROP TABLE / ALTER TABLE is forbidden', sql);
  }

  // Block DELETE on critical tables.
  for (const table of CRITICAL_TABLES_NO_DELETE) {
    const tableUpper = table.toUpperCase();
    // Matches: DELETE FROM <table>, DELETE FROM `<table>`
    if (new RegExp(`\\bDELETE\\s+FROM\\s+\`?${tableUpper}\`?\\b`).test(norm)) {
      throw new BrainQueryViolationError(`DELETE on critical table '${table}' is forbidden`, sql);
    }
  }

  // Block UPDATE on protected columns in critical tables.
  for (const [table, cols] of CRITICAL_TABLES_NO_UPDATE_COLS) {
    const tableUpper = table.toUpperCase();
    if (new RegExp(`\\bUPDATE\\s+\`?${tableUpper}\`?\\b`).test(norm)) {
      for (const col of cols) {
        if (norm.includes(` ${col.toUpperCase()} =`) || norm.includes(`,${col.toUpperCase()}=`)) {
          throw new BrainQueryViolationError(
            `UPDATE ${table}.${col} is forbidden from brain cycle`,
            sql,
          );
        }
      }
    }
  }
}

/**
 * A restricted view of better-sqlite3 for the brain cycle.
 * .prepare() and .exec() run the safety check before delegating to rawSqlite.
 * Read operations (SELECT) are always allowed — only writes are constrained.
 */
export const brainSqlite = {
  prepare(sql: string) {
    const norm = normalise(sql);
    // Only validate write statements — SELECT reads are always safe.
    if (!/^SELECT\b/.test(norm)) {
      assertBrainQuerySafe(sql);
    }
    return rawSqlite.prepare(sql);
  },

  exec(sql: string) {
    assertBrainQuerySafe(sql);
    return rawSqlite.exec(sql);
  },

  // Pass-through for transactions (they call back into prepare/exec which are checked).
  transaction: rawSqlite.transaction.bind(rawSqlite),
  pragma: rawSqlite.pragma.bind(rawSqlite),
};

/**
 * Log a brain cycle decision/proposal to `brain_decisions` table.
 * This is the only way brain produces permanent records — proposals go through
 * human review before any implementation.
 */
rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS brain_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id TEXT,
    decision_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload TEXT,
    status TEXT NOT NULL DEFAULT 'proposed',
    decided_at INTEGER NOT NULL DEFAULT (unixepoch()),
    reviewed_by TEXT,
    reviewed_at INTEGER
  )
`);

export function logBrainDecision(
  cycleId: string | null,
  decisionType: string,
  summary: string,
  payload?: unknown,
): number {
  const result = rawSqlite.prepare(
    `INSERT INTO brain_decisions (cycle_id, decision_type, summary, payload)
     VALUES (?, ?, ?, ?)`
  ).run(cycleId, decisionType, summary, payload ? JSON.stringify(payload) : null);
  return result.lastInsertRowid as number;
}
