// Learning Progress — real, DB-backed stats about what Mara has actually
// read and learned. Deliberately zero AI involvement: every number here is
// a direct SQL aggregate over mara_knowledge_base, not a chat completion.
//
// Why this exists: asking Mara directly in chat "what have you read" relies
// on topic-based retrieval (a sampled search, not an exhaustive count) plus
// whatever the model does with that sample — even with strict honesty
// instructions, that's "give a trustworthy answer when it can", not "give an
// exact number". This module is the exact-number path.

import { rawSqlite } from '../db.js';
import { getBuiltInLibrary } from '../mara-brain/library.js';

export interface LearningOverview {
  builtIn: { total: number; read: number };
  publicLibrary: { read: number; failed: number };
  webTopics: { read: number };
  ideasExtracted: number;
  byCategory: Record<string, number>;
  readRate: { last24h: number; last7d: number };
  publicLibraryHealth: {
    lastSuccessAt: string | null;
    recentAttempts: number;
    recentFailures: number;
  };
}

export interface RecentRead {
  title: string;
  source: 'built-in' | 'public' | 'web';
  category: string | null;
  failed: boolean;
  readAt: string;
}

export interface KnowledgeSample {
  id: number;
  topic: string;
  content: string;
  category: string;
  createdAt: string;
}

export interface UploadedDocument {
  id: number;
  title: string;
  category: string;
  totalChunks: number | null;
  createdAt: string;
}

const DAY_S = 24 * 60 * 60;

// created_at is declared `integer (mode: timestamp)` in the drizzle schema,
// but confirmed directly against the real data (2026-10-05): rows written
// through a raw-SQL insert that lets the column DEFAULT fire get SQLite's
// native CURRENT_TIMESTAMP, which is a TEXT string ('2026-09-11 11:49:38'),
// not an integer — while rows inserted with an explicit value may be a real
// unix-seconds integer. Both forms exist in the same table. Treating a bare
// integer as "already unix seconds" and a text value as "parse it with
// strftime" is the correct per-SQLite-type handling for each, normalized to
// one epoch-seconds expression so every query below can just compare/sort
// numerically regardless of which form a given row happens to be.
//
// (This directly contradicts what server/routes.ts's mara/activity endpoint
// assumes — `new Date(Number(r.created_at) * 1000)` — which silently
// produces an Invalid Date, caught there only by a NaN guard, for every text-
// stored row. Not fixing that endpoint here since it's an unrelated surface;
// flagging it as a real latent bug worth a follow-up.)
const EPOCH_EXPR = `(CASE
  WHEN typeof(created_at) = 'integer' THEN created_at
  WHEN typeof(created_at) = 'text' THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE NULL
END)`;

function countWhere(sql: string, params: unknown[] = []): number {
  const row = rawSqlite.prepare(sql).get(...params) as { c: number } | undefined;
  return row?.c ?? 0;
}

function safeIsoDate(epochSeconds: unknown): string | null {
  const n = Number(epochSeconds);
  if (!Number.isFinite(n)) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function getLearningOverview(): LearningOverview {
  const builtInTotal = getBuiltInLibrary().length;
  // DISTINCT topic — a book can carry more than one read marker (the
  // "re-read by id" repair path used after a past extraction-pipeline bug;
  // see readLibraryBookById in mara-brain/library.ts) — a raw row count
  // would overcount books actually read, confirmed live: 49 marker rows
  // against a 47-book built-in list.
  const builtInRead = countWhere(
    `SELECT COUNT(DISTINCT topic) as c FROM mara_knowledge_base WHERE category = 'library_read_marker'`,
  );
  const publicRead = countWhere(
    `SELECT COUNT(DISTINCT topic) as c FROM mara_knowledge_base
     WHERE category = 'public_library_read_marker' AND json_extract(metadata, '$.failed') IS NOT 1`,
  );
  const publicFailed = countWhere(
    `SELECT COUNT(DISTINCT topic) as c FROM mara_knowledge_base
     WHERE category = 'public_library_read_marker' AND json_extract(metadata, '$.failed') = 1`,
  );
  const webRead = countWhere(`SELECT COUNT(DISTINCT topic) as c FROM mara_knowledge_base WHERE category = 'web_read_marker'`);
  const ideasExtracted = countWhere(`SELECT COUNT(*) as c FROM mara_knowledge_base WHERE category = 'book_knowledge'`);

  // Category breakdown: built-in library markers carry category in metadata
  // (server/mara-brain/library.ts markBookAsRead), public library markers
  // likewise (markPublicBookAsRead) — merge both into one map.
  // NOTE: the output alias must NOT be named "category" — mara_knowledge_base
  // already HAS a real `category` column (the marker TYPE: library_read_marker
  // / public_library_read_marker, only ever 2 values), and naming the
  // json_extract alias the same collapsed GROUP BY onto that real column
  // instead of the per-book category — confirmed live: every row came back
  // grouped as a single bucket showing one arbitrary book's category ("psychology",
  // count 49 — the full row count) instead of a real breakdown.
  const byCategory: Record<string, number> = {};
  const categoryRows = rawSqlite.prepare(`
    SELECT json_extract(metadata, '$.category') as bookCategory, COUNT(DISTINCT topic) as c
    FROM mara_knowledge_base
    WHERE category IN ('library_read_marker', 'public_library_read_marker')
      AND json_extract(metadata, '$.failed') IS NOT 1
      AND json_extract(metadata, '$.category') IS NOT NULL
    GROUP BY bookCategory
  `).all() as { bookCategory: string; c: number }[];
  for (const row of categoryRows) byCategory[row.bookCategory] = row.c;

  const nowS = Math.floor(Date.now() / 1000);
  // Parens matter: AND binds tighter than OR in SQL, so the epoch bound must
  // wrap the whole source-type OR, not just the public-library branch.
  const readRate24h = countWhere(
    `SELECT COUNT(*) as c FROM mara_knowledge_base
     WHERE ${EPOCH_EXPR} >= ?
       AND (
         category IN ('library_read_marker', 'web_read_marker')
         OR (category = 'public_library_read_marker' AND json_extract(metadata, '$.failed') IS NOT 1)
       )`,
    [nowS - DAY_S],
  );
  const readRate7d = countWhere(
    `SELECT COUNT(*) as c FROM mara_knowledge_base
     WHERE ${EPOCH_EXPR} >= ?
       AND (
         category IN ('library_read_marker', 'web_read_marker')
         OR (category = 'public_library_read_marker' AND json_extract(metadata, '$.failed') IS NOT 1)
       )`,
    [nowS - 7 * DAY_S],
  );

  const lastSuccessRow = rawSqlite.prepare(`
    SELECT ${EPOCH_EXPR} as epoch FROM mara_knowledge_base
    WHERE category = 'public_library_read_marker' AND json_extract(metadata, '$.failed') IS NOT 1
    ORDER BY epoch DESC LIMIT 1
  `).get() as { epoch: number } | undefined;

  const recentAttempts = countWhere(
    `SELECT COUNT(*) as c FROM mara_knowledge_base
     WHERE category = 'public_library_read_marker' AND ${EPOCH_EXPR} >= ?`,
    [nowS - DAY_S],
  );
  const recentFailures = countWhere(
    `SELECT COUNT(*) as c FROM mara_knowledge_base
     WHERE category = 'public_library_read_marker' AND json_extract(metadata, '$.failed') = 1
       AND ${EPOCH_EXPR} >= ?`,
    [nowS - DAY_S],
  );

  return {
    builtIn: { total: builtInTotal, read: builtInRead },
    publicLibrary: { read: publicRead, failed: publicFailed },
    webTopics: { read: webRead },
    ideasExtracted,
    byCategory,
    readRate: { last24h: readRate24h, last7d: readRate7d },
    publicLibraryHealth: {
      lastSuccessAt: lastSuccessRow ? safeIsoDate(lastSuccessRow.epoch) : null,
      recentAttempts,
      recentFailures,
    },
  };
}

export function getRecentLibraryReads(limit = 15): RecentRead[] {
  const rows = rawSqlite.prepare(`
    SELECT category, content, metadata, ${EPOCH_EXPR} as epoch
    FROM mara_knowledge_base
    WHERE category IN ('library_read_marker', 'public_library_read_marker', 'web_read_marker')
    ORDER BY epoch DESC
    LIMIT ?
  `).all(limit) as { category: string; content: string; metadata: string; epoch: number }[];

  return rows.map((row) => {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(row.metadata || '{}'); } catch { /* leave empty */ }
    const source: RecentRead['source'] =
      row.category === 'library_read_marker' ? 'built-in'
      : row.category === 'public_library_read_marker' ? 'public'
      : 'web';
    const title = typeof meta.title === 'string' ? meta.title : row.content;
    return {
      title,
      source,
      category: typeof meta.category === 'string' ? meta.category : null,
      failed: meta.failed === true,
      readAt: safeIsoDate(row.epoch) ?? '',
    };
  });
}

export function getKnowledgeSample(limit = 5): KnowledgeSample[] {
  const rows = rawSqlite.prepare(`
    SELECT id, topic, content, category, ${EPOCH_EXPR} as epoch
    FROM mara_knowledge_base
    WHERE category = 'book_knowledge'
    ORDER BY epoch DESC
    LIMIT ?
  `).all(limit) as { id: number; topic: string; content: string; category: string; epoch: number }[];

  return rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    content: row.content,
    category: row.category,
    createdAt: safeIsoDate(row.epoch) ?? '',
  }));
}

// Admin-uploaded documents specifically (not the built-in/public/web library
// tiers, which also write book_knowledge rows via the same processDocument()
// pipeline). addAndReadCustomBook() (mara-brain/library.ts) tags these with
// source: `upload:${category}` in metadata — the only reliable way to tell
// them apart, since every tier shares the same topic format ("Document: X").
export function getUploadedDocuments(limit = 20): UploadedDocument[] {
  const rows = rawSqlite.prepare(`
    SELECT id, topic, metadata, ${EPOCH_EXPR} as epoch
    FROM mara_knowledge_base
    WHERE category = 'book_knowledge' AND json_extract(metadata, '$.source') LIKE 'upload:%'
    ORDER BY epoch DESC
    LIMIT ?
  `).all(limit) as { id: number; topic: string; metadata: string; epoch: number }[];

  return rows.map((row) => {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(row.metadata || '{}'); } catch { /* leave empty */ }
    const source = typeof meta.source === 'string' ? meta.source : 'upload:general';
    return {
      id: row.id,
      title: typeof meta.documentTitle === 'string' ? meta.documentTitle : row.topic.replace(/^Document: /, ''),
      category: source.slice('upload:'.length) || 'general',
      totalChunks: typeof meta.totalChunks === 'number' ? meta.totalChunks : null,
      createdAt: safeIsoDate(row.epoch) ?? '',
    };
  });
}
