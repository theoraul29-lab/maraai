// One-time (idempotent) data fix: the first Wikisource cache entries were
// written while fetchAndCacheWikisourceBook() still used the API's
// `displaytitle` field, which can carry HTML formatting spans for
// stylized page titles — that HTML leaked straight into the cached title
// (and, as a side effect, broke the "(Author)" parse that depends on the
// title actually ending in a plain ")", leaving authors empty). Deletes any
// such row so the next read re-fetches it with the corrected logic.
//
// Safe to run every boot: the WHERE clause only ever matches rows still
// carrying literal HTML in the title, so an already-fixed row is never
// touched again.
import { rawSqlite } from '../db.js';

const WIKISOURCE_ID_OFFSET = 1_000_000_000;

export function fixWikisourceCacheTitles(): void {
  const rows = rawSqlite
    .prepare(`SELECT id FROM library_books_cache WHERE id >= ? AND title LIKE '%<span%'`)
    .all(WIKISOURCE_ID_OFFSET) as { id: number }[];
  if (rows.length === 0) return;

  const del = rawSqlite.prepare('DELETE FROM library_books_cache WHERE id = ?');
  const tx = rawSqlite.transaction((items: { id: number }[]) => {
    for (const row of items) del.run(row.id);
  });
  tx(rows);
  console.log(`[bootstrap] Cleared ${rows.length} Wikisource cache row(s) with HTML-polluted titles (will re-fetch on next read)`);
}
