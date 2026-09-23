// One-time (idempotent) data fix, covering a few rounds of the same root
// cause: fetchAndCacheWikisourceBook()'s HTML-to-text stripping went
// through several corrections during development (raw `displaytitle` HTML
// leaking into the title; a byline header block, a "see also" navbox, a
// "back to top" link, and a license notice all surviving into the reading
// text; HTML numeric entities like &#8211; — the en-dash Romanian dialogue
// almost always opens with — never being decoded). Rows cached by an
// earlier version of that logic would otherwise be served with these
// defects forever, since the cache is permanent once written. Deletes any
// row still showing a symptom of one of those fixed bugs so the next read
// re-fetches it with the current logic.
//
// Safe to run every boot: the WHERE clause only ever matches rows still
// carrying one of these specific, already-fixed defects, so a genuinely
// clean row is never touched again.
import { rawSqlite } from '../db.js';

const WIKISOURCE_ID_OFFSET = 1_000_000_000;

export function fixWikisourceCacheTitles(): void {
  const rows = rawSqlite
    .prepare(`
      SELECT id FROM library_books_cache
      WHERE id >= ? AND (
        title LIKE '%<span%'
        OR content LIKE '%&#%;%'
        OR content LIKE '%Începutul paginii%'
        OR content LIKE '%licenseContainer%'
      )
    `)
    .all(WIKISOURCE_ID_OFFSET) as { id: number }[];
  if (rows.length === 0) return;

  const del = rawSqlite.prepare('DELETE FROM library_books_cache WHERE id = ?');
  const tx = rawSqlite.transaction((items: { id: number }[]) => {
    for (const row of items) del.run(row.id);
  });
  tx(rows);
  console.log(`[bootstrap] Cleared ${rows.length} Wikisource cache row(s) with known content defects (will re-fetch on next read)`);
}
