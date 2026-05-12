// Knowledge conflict detection — heuristic only, observational only.
//
// When storeKnowledge() inserts (or upserts) a row, we check the same-
// category neighbours for *polarity disagreement*: pairs of common
// adjectives that imply contradictory claims about the same topic. The
// canonical example from audit-mara-brain.md F2 is:
//
//   row A: topic="trading", content="...crypto trading is risky..."
//   row B: topic="trading", content="...crypto trading is the safest investment..."
//
// Both can plausibly come from different books or LLM passes. We don't
// want to silently keep both as if they agreed (Mara then sounds
// inconsistent to users) and we don't want to drop either (we'd lose
// real nuance). We split the difference: keep both rows in
// mara_knowledge_base, and *flag* the pair in mara_knowledge_conflicts
// for human review. Admin dashboards can show "n unresolved conflicts"
// and let an admin pick a winner or rewrite.
//
// Heuristic is deliberately cheap (no LLM call) so it stays under the
// rate-limit cap and runs synchronously inside storeKnowledge's
// transaction. False positives are acceptable (worst case, an admin
// resolves a non-conflict). False negatives are also acceptable (the
// system silently keeps a real contradiction until the next pass) —
// this is a soft consistency layer, not a hard guarantee.

import { rawSqlite } from '../db.js';

interface KnowledgeRow {
  id: number;
  content: string;
  category: string;
}

/**
 * Pairs of words that, when one appears in row A and the other in row B
 * for the same topic+category, suggest the rows make opposite claims.
 * Each pair is bidirectional. Kept small so the inner loop is O(rows ×
 * pairs) and finishes in microseconds for the dozens of neighbours
 * `storeKnowledge` looks at per insert.
 */
const POLARITY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['safe', 'risky'],
  ['safe', 'dangerous'],
  ['safer', 'riskier'],
  ['best', 'worst'],
  ['better', 'worse'],
  ['cheap', 'expensive'],
  ['cheaper', 'pricier'],
  ['fast', 'slow'],
  ['faster', 'slower'],
  ['reliable', 'unreliable'],
  ['stable', 'unstable'],
  ['legal', 'illegal'],
  ['profitable', 'unprofitable'],
  ['profitable', 'loss-making'],
  ['growing', 'shrinking'],
  ['secure', 'insecure'],
  ['effective', 'ineffective'],
  ['recommended', 'not recommended'],
  ['recommended', 'discouraged'],
  ['popular', 'unpopular'],
  ['trustworthy', 'untrustworthy'],
];

const WORD_BOUNDARY_FLAGS = 'iu' as const;

function regexFor(token: string): RegExp {
  // Hyphenated tokens like "loss-making" can't use simple \b matchers
  // because - is a word boundary on its own. For multi-word tokens just
  // do a case-insensitive substring match; single-word tokens get \b on
  // both sides so we don't match "saferoom" when looking for "safe".
  if (/[\s\-]/.test(token)) {
    return new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), WORD_BOUNDARY_FLAGS);
  }
  return new RegExp(`\\b${token}\\b`, WORD_BOUNDARY_FLAGS);
}

const PRECOMPILED = POLARITY_PAIRS.map(([a, b]) => ({
  a,
  b,
  rxA: regexFor(a),
  rxB: regexFor(b),
}));

/**
 * Return the first matching polarity pair where row A contains one side
 * and row B contains the other. Returns null if no contradiction is
 * detected.
 *
 * Exported so unit tests can exercise the heuristic independently of
 * the SQLite-flagging side effect.
 */
export function detectPolarityConflict(
  contentA: string,
  contentB: string,
): { reason: string } | null {
  for (const p of PRECOMPILED) {
    if (
      (p.rxA.test(contentA) && p.rxB.test(contentB)) ||
      (p.rxB.test(contentA) && p.rxA.test(contentB))
    ) {
      return { reason: `polarity:${p.a}-vs-${p.b}` };
    }
  }
  return null;
}

/**
 * Inserts a conflict marker pairing `newId` with any existing same-
 * category row whose content disagrees on a polarity pair. Idempotent —
 * a pair (a, b) won't be inserted twice (we ORDER BY id and require
 * knowledge_a_id < knowledge_b_id, then `INSERT OR IGNORE` on a uniqueness
 * substitute via NOT EXISTS).
 *
 * Returns the number of conflict rows inserted (0, 1, or N for a
 * cluster of contradictions).
 */
export function flagConflictsForKnowledge(
  newId: number,
  newContent: string,
  newCategory: string,
  neighbours: readonly KnowledgeRow[],
): number {
  let inserted = 0;
  for (const other of neighbours) {
    if (other.id === newId) continue;
    if (other.category !== newCategory) continue;
    const conflict = detectPolarityConflict(newContent, other.content);
    if (!conflict) continue;

    // Normalise the pair so a/b are sorted by id — keeps the dedup check below
    // simple regardless of which row was inserted first.
    const a = Math.min(newId, other.id);
    const b = Math.max(newId, other.id);

    // Skip if this pair already has an open conflict row.
    const existing = rawSqlite
      .prepare<[number, number], { id: number }>(
        `SELECT id FROM mara_knowledge_conflicts
           WHERE knowledge_a_id = ? AND knowledge_b_id = ?
             AND resolved = 0
           LIMIT 1`,
      )
      .get(a, b);
    if (existing) continue;

    rawSqlite
      .prepare(
        `INSERT INTO mara_knowledge_conflicts
           (knowledge_a_id, knowledge_b_id, reason, category)
         VALUES (?, ?, ?, ?)`,
      )
      .run(a, b, conflict.reason, newCategory);
    inserted += 1;
  }
  return inserted;
}

/** Diagnostic helper used by the admin endpoint. */
export interface ConflictRow {
  id: number;
  knowledge_a_id: number;
  knowledge_b_id: number;
  reason: string;
  category: string;
  resolved: number;
  resolved_by: string | null;
  resolved_at: number | null;
  created_at: number;
}

export function listUnresolvedConflicts(limit = 50): ConflictRow[] {
  return rawSqlite
    .prepare<[number], ConflictRow>(
      `SELECT id, knowledge_a_id, knowledge_b_id, reason, category,
              resolved, resolved_by, resolved_at, created_at
       FROM mara_knowledge_conflicts
       WHERE resolved = 0
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit);
}

export function resolveConflict(id: number, resolvedBy: string): boolean {
  const result = rawSqlite
    .prepare(
      `UPDATE mara_knowledge_conflicts
         SET resolved = 1, resolved_by = ?, resolved_at = ?
       WHERE id = ? AND resolved = 0`,
    )
    .run(resolvedBy, Date.now(), id);
  return result.changes === 1;
}
