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
// Gutendex occasionally times out on a cold/first request (seen repeatedly
// building this feature) — a short retry here means a bad first attempt
// doesn't leave the cache un-warmed for a full day.
const FAILURE_RETRY_MS = 10 * 60 * 1000;

/** Each language's list is fetched independently — one timing out shouldn't take the others down with it. */
async function fetchPopularIdsResilient(): Promise<number[]> {
  const results = await Promise.allSettled([
    listPopularBookIds('', 40),
    listPopularBookIds('ro', 10), // effectively "all of them" — Gutendex has only a handful
    listPopularBookIds('en', 20),
    listPopularBookIds('de', 20),
  ]);
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) console.warn(`[library-precache] ${failed}/${results.length} popular-list fetches failed this run`);
  const ids = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return [...new Set(ids)];
}

/** Returns false when the run got nothing at all (worth a short retry) rather than throwing. */
async function precacheOnce(): Promise<boolean> {
  const candidateIds = await fetchPopularIdsResilient();
  if (candidateIds.length === 0) {
    console.warn('[library-precache] got zero popular book ids this run');
    return false;
  }

  const missing = candidateIds.filter((id) => !getCachedBook(id));
  if (missing.length === 0) {
    console.log(`[library-precache] all ${candidateIds.length} popular books already cached`);
    return true;
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
  return true;
}

export function startLibraryPrecache(): void {
  const runWithRetry = async () => {
    const ok = await precacheOnce().catch((err) => {
      console.warn('[library-precache] run failed unexpectedly:', err);
      return false;
    });
    if (!ok) setTimeout(() => { void runWithRetry(); }, FAILURE_RETRY_MS);
  };
  void runWithRetry();
  setInterval(() => { void precacheOnce(); }, RERUN_INTERVAL_MS);
}
