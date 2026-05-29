// Brain Session State — persistent working memory that survives the 10-min respiro.
// Each cycle reads the previous memo, acts on it, then writes a new one for next time.
// Single-row table (id=1) — UPSERT keeps it simple.

import { rawSqlite } from '../db.js';

export interface BrainSession {
  cycleCount: number;
  focusArea: string;
  openQuestions: string[];
  pendingThoughts: string[];
  lastLearnings: string[];
  continuityNotes: string;
}

const DEFAULT_SESSION: BrainSession = {
  cycleCount: 0,
  focusArea: 'bootstrap — primul ciclu',
  openQuestions: [],
  pendingThoughts: [],
  lastLearnings: [],
  continuityNotes: '',
};

export function ensureSessionTable(): void {
  rawSqlite.exec(`
    CREATE TABLE IF NOT EXISTS brain_session_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cycle_count INTEGER NOT NULL DEFAULT 0,
      focus_area TEXT NOT NULL DEFAULT '',
      open_questions TEXT NOT NULL DEFAULT '[]',
      pending_thoughts TEXT NOT NULL DEFAULT '[]',
      last_learnings TEXT NOT NULL DEFAULT '[]',
      continuity_notes TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);
}

export function loadSession(): BrainSession {
  try {
    const row = rawSqlite
      .prepare('SELECT * FROM brain_session_state WHERE id = 1')
      .get() as Record<string, unknown> | undefined;

    if (!row) return { ...DEFAULT_SESSION };

    return {
      cycleCount: (row.cycle_count as number) ?? 0,
      focusArea: (row.focus_area as string) || DEFAULT_SESSION.focusArea,
      openQuestions: safeParseJson(row.open_questions as string, []),
      pendingThoughts: safeParseJson(row.pending_thoughts as string, []),
      lastLearnings: safeParseJson(row.last_learnings as string, []),
      continuityNotes: (row.continuity_notes as string) || '',
    };
  } catch (err) {
    console.warn('[BrainSession] loadSession failed, using defaults:', err);
    return { ...DEFAULT_SESSION };
  }
}

export function saveSession(session: BrainSession): void {
  try {
    rawSqlite
      .prepare(`
        INSERT INTO brain_session_state
          (id, cycle_count, focus_area, open_questions, pending_thoughts, last_learnings, continuity_notes, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          cycle_count      = excluded.cycle_count,
          focus_area       = excluded.focus_area,
          open_questions   = excluded.open_questions,
          pending_thoughts = excluded.pending_thoughts,
          last_learnings   = excluded.last_learnings,
          continuity_notes = excluded.continuity_notes,
          updated_at       = excluded.updated_at
      `)
      .run(
        session.cycleCount,
        session.focusArea,
        JSON.stringify(session.openQuestions.slice(0, 5)),
        JSON.stringify(session.pendingThoughts.slice(0, 5)),
        JSON.stringify(session.lastLearnings.slice(0, 10)),
        session.continuityNotes.slice(0, 2000),
        Date.now(),
      );
  } catch (err) {
    console.warn('[BrainSession] saveSession failed:', err);
  }
}

// Parse a JSON array stored as a string; return fallback on any error.
function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Parse the LLM-generated continuity memo and return an updated session.
 * Expected LLM format (each field on its own line):
 *   FOCUS: ...
 *   ÎNTREBĂRI: ...
 *   GÂNDURI: ...
 *   NOTE: ...
 */
export function parseContinuityMemo(
  raw: string,
  prevSession: BrainSession,
  cycleResearch: string[],
): BrainSession {
  const get = (key: string): string => {
    const re = new RegExp(`^${key}:\\s*(.+)`, 'im');
    return raw.match(re)?.[1]?.trim() ?? '';
  };

  const splitList = (text: string): string[] =>
    text
      .split(/[;\n]/)
      .map((s) => s.replace(/^[-•*\d.]+\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5);

  return {
    cycleCount: prevSession.cycleCount + 1,
    focusArea: get('FOCUS') || prevSession.focusArea,
    openQuestions: splitList(get('ÎNTREBĂRI') || get('INTREBARI') || get('QUESTIONS')),
    pendingThoughts: splitList(get('GÂNDURI') || get('GANDURI') || get('THOUGHTS')),
    lastLearnings: cycleResearch.slice(0, 10),
    continuityNotes: get('NOTE') || get('NOTES') || '',
  };
}
