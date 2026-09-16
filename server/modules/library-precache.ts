/**
 * Pre-warms the Public Library cache with popular books BEFORE anyone asks
 * for them, so the common case (a new visitor opens one of the books
 * everybody opens) is an instant cache hit instead of a first-time
 * Gutenberg download. Directly targets the "books load very slowly, and
 * sometimes error" complaint — most visitors will simply never hit the slow
 * path anymore.
 *
 * Gutendex's default ordering (no search query) is by download_count
 * descending, so "page 1 with no filter" IS the popular list — see
 * listPopularBookIds() in library.ts.
 */
import { getCachedBook, fetchAndCacheBook, listPopularBookIds } from './library.js';

const FETCH_DELAY_MS = 2_000; // spaced out — this shares Gutenberg with real reader traffic
const RERUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // popularity shifts slowly; once a day is plenty

async function precacheOnce(): Promise<void> {
  let candidateIds: number[] = [];
  try {
    const [overall, ro, en, de] = await Promise.all([
      listPopularBookIds('', 40),
      listPopularBookIds('ro', 10), // effectively "all of them" — Gutendex has only a handful
      listPopularBookIds('en', 20),
      listPopularBookIds('de', 20),
    ]);
    candidateIds = [...new Set([...overall, ...ro, ...en, ...de])];
  } catch (err) {
    console.warn('[library-precache] failed to fetch popular book lists, skipping this run:', err);
    return;
  }

  const missing = candidateIds.filter((id) => !getCachedBook(id));
  if (missing.length === 0) {
    console.log(`[library-precache] all ${candidateIds.length} popular books already cached`);
    return;
  }
  console.log(`[library-precache] warming cache for ${missing.length}/${candidateIds.length} popular book(s)`);

  let succeeded = 0;
  for (const id of missing) {
    try {
      await fetchAndCacheBook(id);
      succeeded += 1;
    } catch (err) {
      console.warn(`[library-precache] failed to cache book ${id}:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS));
  }
  console.log(`[library-precache] done — cached ${succeeded}/${missing.length} book(s)`);
}

export function startLibraryPrecache(): void {
  void precacheOnce();
  setInterval(() => { void precacheOnce(); }, RERUN_INTERVAL_MS);
}
