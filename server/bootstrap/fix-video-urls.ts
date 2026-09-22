// One-time (idempotent) data fix: a batch of seeded demo Sparks was inserted
// with `youtube:<videoId>` as the `url` value — not a real URL, just a
// shorthand someone used when seeding. The frontend player only knows how
// to handle either a real playable <video> src or a proper YouTube URL it
// can extract an embed ID from; `youtube:xyz` matches neither, so it fell
// through to the native <video> path and got blocked by the media-src CSP,
// showing as a broken/blank player for ~75% of the Sparks feed.
//
// Safe to run every boot: the WHERE clause only ever matches rows still in
// the old shorthand form, so already-fixed rows are never touched again.
import { rawSqlite } from '../db.js';

export function fixMalformedYouTubeVideoUrls(): void {
  const rows = rawSqlite
    .prepare(`SELECT id, url FROM videos WHERE url LIKE 'youtube:%'`)
    .all() as { id: number; url: string }[];
  if (rows.length === 0) return;

  const update = rawSqlite.prepare(
    `UPDATE videos SET url = ?, thumbnail_url = COALESCE(thumbnail_url, ?), external_platform = COALESCE(external_platform, 'youtube') WHERE id = ?`,
  );
  const tx = rawSqlite.transaction((items: { id: number; url: string }[]) => {
    for (const row of items) {
      const videoId = row.url.slice('youtube:'.length).trim();
      if (!videoId) continue;
      update.run(
        `https://www.youtube.com/watch?v=${videoId}`,
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        row.id,
      );
    }
  });
  tx(rows);
  console.log(`[bootstrap] Fixed ${rows.length} malformed youtube: video URLs`);
}
