/**
 * One-time (well — one-time per still-missing row) backfill of embeddings
 * for knowledge rows that predate the semantic-search upgrade. New rows get
 * an embedding automatically via storeKnowledge() going forward; this just
 * catches up the ~2000 rows that already existed.
 *
 * Runs in the background after boot, paced with a delay between batches so
 * it doesn't compete with real chat/brain-cycle traffic for the same local
 * Ollama instance. Safe to interrupt (a restart mid-backfill just resumes
 * where it left off, since progress is the row's own presence in
 * mara_knowledge_vec — not tracked separately) and safe to call on every
 * boot (a no-op once caught up).
 */
import { rawSqlite, isVecExtensionAvailable } from '../db.js';
import { getEmbedding, vecToBuffer } from './embeddings.js';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;

interface PendingRow {
  id: number;
  topic: string;
  content: string;
}

export async function backfillKnowledgeEmbeddings(): Promise<void> {
  if (!isVecExtensionAvailable()) return;

  const { kbCount } = rawSqlite.prepare('SELECT COUNT(*) AS kbCount FROM mara_knowledge_base').get() as { kbCount: number };
  if (kbCount === 0) return;
  const { vecCount } = rawSqlite.prepare('SELECT COUNT(*) AS vecCount FROM mara_knowledge_vec').get() as { vecCount: number };
  if (vecCount >= kbCount) return; // already caught up

  console.log(`[embeddings-backfill] ${vecCount}/${kbCount} knowledge rows embedded — backfilling the rest in the background`);
  const selectBatch = rawSqlite.prepare(`
    SELECT kb.id, kb.topic, kb.content FROM mara_knowledge_base kb
    WHERE kb.id > ? AND NOT EXISTS (SELECT 1 FROM mara_knowledge_vec kv WHERE kv.rowid = kb.id)
    ORDER BY kb.id ASC LIMIT ?
  `);
  const del = rawSqlite.prepare('DELETE FROM mara_knowledge_vec WHERE rowid = ?');
  const ins = rawSqlite.prepare('INSERT INTO mara_knowledge_vec(rowid, embedding) VALUES (?, ?)');

  let lastId = 0;
  let processed = 0;
  let failed = 0;
  for (;;) {
    const batch = selectBatch.all(lastId, BATCH_SIZE) as PendingRow[];
    if (batch.length === 0) break;

    for (const row of batch) {
      lastId = row.id;
      try {
        const vec = await getEmbedding(`${row.topic}\n${row.content}`);
        if (vec) {
          const rowId = BigInt(row.id);
          del.run(rowId);
          ins.run(rowId, vecToBuffer(vec));
          processed += 1;
        } else {
          failed += 1;
        }
      } catch (err) {
        failed += 1;
        console.warn(`[embeddings-backfill] failed for knowledge id=${row.id}:`, err);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
  }
  console.log(`[embeddings-backfill] done — embedded ${processed} row(s), ${failed} skipped/failed`);
}
