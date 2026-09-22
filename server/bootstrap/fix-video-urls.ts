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

// Some seeded videos point at hosts the player can never actually load —
// neither a real YouTube URL, a direct video file, nor one of the sample
// hosts allow-listed in server/index.ts's media-src CSP (see fix above for
// how the youtube: shorthand ones specifically broke). Rather than keep
// shipping those into the "approved" feed as permanently-blank cards with
// no visible explanation, flag them out of rotation until someone gives
// them a real URL. Idempotent: only ever touches rows still 'approved'
// with a bad host, so a manually-approved fix later isn't re-flagged.
const ALLOWED_VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'commondatastorage.googleapis.com',
  'test-videos.co.uk',
];

export function flagVideosWithUnplayableUrls(): void {
  const rows = rawSqlite
    .prepare(`SELECT id, url, file_key FROM videos WHERE moderation_status = 'approved'`)
    .all() as { id: number; url: string; file_key: string | null }[];

  const bad = rows.filter((r) => {
    if (r.file_key) return false; // uploaded file — served from our own storage, always fine
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      return !ALLOWED_VIDEO_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    } catch {
      return true; // not even a parseable URL
    }
  });
  if (bad.length === 0) return;

  const update = rawSqlite.prepare(`UPDATE videos SET moderation_status = 'pending' WHERE id = ?`);
  const tx = rawSqlite.transaction((items: typeof bad) => {
    for (const row of items) update.run(row.id);
  });
  tx(bad);
  console.log(`[bootstrap] Flagged ${bad.length} videos with unplayable URLs out of the feed:`, bad.map((b) => b.id).join(', '));
}
