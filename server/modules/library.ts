// Public Library — free classic books via Gutendex (Project Gutenberg's API).
//
// Architecture (agreed with the owner before building this): the catalog
// itself is never bulk-downloaded. Search/browse always hits the live
// Gutendex API. A book's actual text is fetched from Gutenberg exactly ONCE,
// on the first read request, and cached permanently in our own SQLite DB
// (library_books_cache, on the Railway persistent volume) — every read after
// that is a local DB read, so a book never "disappears" even if Gutendex or
// Gutenberg is briefly unreachable later.
import { rawSqlite } from '../db.js';
import { assertSafeExternalUrl } from '../lib/ssrf-guard.js';

// Gutendex's own response tells us which host actually serves a book's
// text — always some gutenberg.org mirror in practice, but defence-in-depth
// against a compromised/malicious Gutendex response pointing this server's
// outbound fetch at an internal address (metadata endpoints, localhost,
// etc.) costs nothing here since the real host never changes.
const GUTENBERG_CONTENT_DOMAINS = ['gutenberg.org'];

const GUTENDEX_BASE = 'https://gutendex.com/books/';
const SUPPORTED_LANGS = new Set(['ro', 'en', 'de']);
// A book's raw text response is capped here — guards against a pathological
// fetch (the largest real Gutenberg texts run a few MB); the store below
// would otherwise happily cache an unbounded blob into SQLite.
const MAX_CONTENT_BYTES = 6_000_000;
const FETCH_TIMEOUT_MS = 20_000;
// The actual book text (vs. Gutendex's small JSON metadata) is served
// straight from Gutenberg's own mirrors, which are noticeably slower and
// more variable — confirmed in production, a request that easily fits
// FETCH_TIMEOUT_MS for metadata/search timed out twice fetching one book's
// text. Give that specific request more room.
const TEXT_FETCH_TIMEOUT_MS = 40_000;
// Gutendex/Gutenberg 403s requests with no User-Agent (or a generic one) —
// confirmed in production: identical requests worked from a local machine
// but were rejected from Railway's outbound IP until this header was added.
const FETCH_HEADERS = { 'User-Agent': 'MaraAI-PublicLibrary/1.0 (+https://hellomara.net; contact: info@hellomara.net)' };

// --- Wikisource (Romanian public-domain texts) -------------------------------
//
// Gutenberg's own Romanian-language catalog is tiny (5 books, confirmed
// live) — Wikisource's Romanian project (a Wikimedia sister site to
// Wikipedia, same MediaWiki API, same "anyone can add sources, but content
// is community-reviewed" model) is the actual real source of Romanian
// classics: 975+ hits just searching "Eminescu". Reuses every existing
// piece of this module (cache table, reader, save/progress) unchanged —
// the only new thing is a second search+fetch path feeding the same shapes.
//
// ID collision: Wikisource pageids and Gutenberg book ids are both small
// plain integers from unrelated numbering spaces, and library_books_cache
// uses a single `id` primary key. Rather than widen that key (touches the
// cache table, user_library_books, and every frontend type that treats a
// book id as a bare number), Wikisource ids are exposed to the rest of the
// app offset by a billion — comfortably outside Gutenberg's current catalog
// size (~75k). isWikisourceId()/toWikisourcePageId() are the only two
// places that ever need to know this.
const WIKISOURCE_ID_OFFSET = 1_000_000_000;
const WIKISOURCE_API = 'https://ro.wikisource.org/w/api.php';
const WIKISOURCE_CONTENT_DOMAINS = ['ro.wikisource.org'];
const WIKISOURCE_PAGE_SIZE = 20;

function isWikisourceId(id: number): boolean {
  return id >= WIKISOURCE_ID_OFFSET;
}
function toWikisourcePageId(id: number): number {
  return id - WIKISOURCE_ID_OFFSET;
}

// A handful of hand-verified classics (real pageids, checked live against
// the API — not guessed) for the "Clasici români" curated shelf. Wikisource
// has no Gutendex-style download_count to derive "popular" from, so this is
// curated by hand instead of computed.
const CURATED_RO_CLASSICS: Array<{ pageId: number; title: string; author: string }> = [
  { pageId: 2356, title: 'Luceafărul', author: 'Mihai Eminescu' },
  { pageId: 2519, title: 'Scrisoarea III', author: 'Mihai Eminescu' },
  { pageId: 2305, title: 'Ce te legeni...', author: 'Mihai Eminescu' },
  { pageId: 1405, title: 'Amintiri din copilărie', author: 'Ion Creangă' },
  { pageId: 1378, title: 'O scrisoare pierdută', author: 'Ion Luca Caragiale' },
  { pageId: 1443, title: 'Moara cu noroc', author: 'Ioan Slavici' },
];

interface WikisourceSearchResult { pageid: number; title: string; wordcount: number }

// Wikisource page titles conventionally use a trailing "(...)" for
// disambiguation — usually the author ("Dorința (Eminescu)"), but sometimes
// a year/edition ("Poesii (1888-1894)") or even a quoted line of the poem
// itself, for titles common enough to need distinguishing another way.
// Confirmed against a live 'ro' search: both of the latter cases show up
// often enough to be worth filtering rather than mislabeling as "author".
// A real name is short and starts every word with a capital letter — a rough
// but effective filter against both false-positive shapes above.
function looksLikeAuthorName(candidate: string): boolean {
  if (/\d/.test(candidate)) return false; // years/date ranges
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false; // a poem-line fragment runs longer
  return words.every((w) => /^[A-ZȘȚĂÂÎ]/.test(w));
}

function parseWikisourceTitle(rawTitle: string): { title: string; author: string | null } {
  const match = rawTitle.match(/^(.*)\(([^()]+)\)\s*$/);
  if (!match) return { title: rawTitle, author: null };
  const title = match[1].trim();
  const candidate = match[2].trim();
  return { title, author: looksLikeAuthorName(candidate) ? candidate : null };
}

async function wikisourceFetch(params: Record<string, string>): Promise<any> {
  const url = `${WIKISOURCE_API}?${new URLSearchParams({ format: 'json', ...params }).toString()}`;
  const resp = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Wikisource returned ${resp.status}`);
  return resp.json();
}

async function searchWikisource(query: string, page: number): Promise<{ count: number; hasNext: boolean; books: LibrarySearchResult[] }> {
  const offset = (page - 1) * WIKISOURCE_PAGE_SIZE;
  const data = await wikisourceFetch({
    action: 'query',
    list: 'search',
    srsearch: query || 'domeniul public',
    srlimit: String(WIKISOURCE_PAGE_SIZE),
    sroffset: String(offset),
    srnamespace: '0', // main article namespace only — excludes Talk:/Category:/User: pages
  });
  const results: WikisourceSearchResult[] = data.query?.search ?? [];
  const totalHits: number = data.query?.searchinfo?.totalhits ?? results.length;
  const books = results.map((r) => {
    const { title, author } = parseWikisourceTitle(r.title);
    return {
      id: WIKISOURCE_ID_OFFSET + r.pageid,
      title,
      authors: author ? [author] : [],
      languages: ['ro'],
      subjects: [] as string[],
      coverUrl: null as string | null,
      downloadCount: 0,
    };
  });
  return { count: totalHits, hasNext: Boolean(data.continue), books };
}

/**
 * Removes the first element starting at `openTag` (e.g. a `<div ...>` whose
 * class list matched something we want gone) through its true matching
 * close tag, tracking nesting depth — a regex alone can't do this correctly
 * since Wikisource's header/nav boxes are several divs deep and a
 * non-greedy `[\s\S]*?</div>` just matches the *nearest* closing div, not
 * the one that actually balances the one we started at (confirmed live:
 * that's exactly why the previous version of this function left the whole
 * byline/sister-projects header block in the actual reading text).
 */
function removeBalancedElement(html: string, startIndex: number, tagName: string): string {
  const openRe = new RegExp(`<${tagName}\\b`, 'gi');
  const closeRe = new RegExp(`</${tagName}>`, 'gi');
  openRe.lastIndex = startIndex;
  closeRe.lastIndex = startIndex;
  let depth = 0;
  let cursor = startIndex;
  while (true) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return html; // malformed/truncated — bail out, leave html untouched
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      cursor = nextClose.index + nextClose[0].length;
      if (depth === 0) return html.slice(0, startIndex) + html.slice(cursor);
    }
  }
}

/** Finds and removes every top-level element whose class attribute contains `className`. */
function removeElementsByClass(html: string, tagName: string, className: string): string {
  const classRe = new RegExp(`<${tagName}\\b[^>]*\\bclass="[^"]*\\b${className}\\b[^"]*"`, 'i');
  let result = html;
  for (let guard = 0; guard < 20; guard++) {
    const match = classRe.exec(result);
    if (!match) break;
    result = removeBalancedElement(result, match.index, tagName);
  }
  return result;
}

/**
 * Wikisource's rendered HTML carries far more page "furniture" than
 * Gutenberg's — a byline/sister-projects header block, editorial notes,
 * category boxes — none of which belongs in reading text. Strip the known
 * wrapper elements first (balanced, nesting-aware — see above), then fall
 * through to the same generic tag-stripping stripHtmlToText already does
 * for Gutenberg's HTML fallback.
 */
function stripWikisourceHtmlToText(html: string): string {
  let withoutChrome = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  withoutChrome = removeElementsByClass(withoutChrome, 'div', 'ws-header');
  withoutChrome = removeElementsByClass(withoutChrome, 'div', 'ws-noexport');
  return stripHtmlToText(withoutChrome);
}

async function fetchAndCacheWikisourceBook(id: number): Promise<CachedBook> {
  const pageId = toWikisourcePageId(id);
  const data = await wikisourceFetch({ action: 'parse', pageid: String(pageId), prop: 'text' });
  if (data.error) throw new Error(data.error.info || 'Book not found');
  const rawHtml: string = data.parse?.text?.['*'] ?? '';
  // The plain `title` field is always clean text; `displaytitle` (not
  // requested here) can carry HTML formatting spans for pages with
  // stylized titles — confirmed live: that HTML leaked straight into the
  // book's title, and broke the "(Author)" parse that depends on the
  // string actually ending in a plain ")".
  const rawTitle: string = data.parse?.title ?? 'Untitled';
  if (!rawHtml) throw new Error('Downloaded book text was empty');

  // Validate the content URL's host the same way Gutenberg content is —
  // defence-in-depth even though this specific request always targets the
  // fixed WIKISOURCE_API constant above, not a URL taken from the response.
  await assertSafeExternalUrl(`https://ro.wikisource.org/wiki/Special:Redirect/page/${pageId}`, WIKISOURCE_CONTENT_DOMAINS);

  const { title, author } = parseWikisourceTitle(rawTitle);
  let content = stripWikisourceHtmlToText(rawHtml);
  if (!content) throw new Error('Downloaded book text was empty');

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const fetchedAt = Math.floor(Date.now() / 1000);
  const record = {
    id,
    title,
    authors: JSON.stringify(author ? [author] : []),
    languages: JSON.stringify(['ro']),
    subjects: JSON.stringify([]),
    coverUrl: null,
    content,
    contentFormat: 'text',
    wordCount,
    fetchedAt,
  };
  rawSqlite.prepare(`
    INSERT INTO library_books_cache (id, title, authors, languages, subjects, cover_url, content, content_format, word_count, fetched_at)
    VALUES (@id, @title, @authors, @languages, @subjects, @coverUrl, @content, @contentFormat, @wordCount, @fetchedAt)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, authors=excluded.authors, languages=excluded.languages, subjects=excluded.subjects,
      cover_url=excluded.cover_url, content=excluded.content, content_format=excluded.content_format,
      word_count=excluded.word_count, fetched_at=excluded.fetched_at
  `).run(record);

  return getCachedBook(id)!;
}

export async function getCuratedRomanianClassics(req: any, res: any) {
  res.json({
    books: CURATED_RO_CLASSICS.map((c) => ({
      id: WIKISOURCE_ID_OFFSET + c.pageId,
      title: c.title,
      authors: [c.author],
      languages: ['ro'],
      subjects: [] as string[],
      coverUrl: null as string | null,
      downloadCount: 0,
    })),
  });
}

interface GutendexPerson { name: string; birth_year: number | null; death_year: number | null }
interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexPerson[];
  languages: string[];
  subjects: string[];
  formats: Record<string, string>;
  download_count: number;
}

interface CachedBook {
  id: number;
  title: string;
  authors: string[];
  languages: string[];
  subjects: string[];
  coverUrl: string | null;
  content: string;
  contentFormat: 'text' | 'html';
  wordCount: number;
  fetchedAt: number;
}

export interface LibrarySearchResult {
  id: number;
  title: string;
  authors: string[];
  languages: string[];
  subjects: string[];
  coverUrl: string | null;
  downloadCount: number;
}

function normalizeSearchResult(b: GutendexBook): LibrarySearchResult {
  return {
    id: b.id,
    title: b.title,
    authors: b.authors.map((a) => a.name),
    languages: b.languages,
    subjects: b.subjects.slice(0, 6),
    coverUrl: b.formats['image/jpeg'] ?? null,
    downloadCount: b.download_count,
  };
}

export async function searchLibrary(req: any, res: any) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  const langParam = typeof req.query.lang === 'string' ? req.query.lang.trim().toLowerCase() : '';
  const lang = SUPPORTED_LANGS.has(langParam) ? langParam : '';
  const pageParam = Number.parseInt(String(req.query.page ?? '1'), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const params = new URLSearchParams();
  if (q) params.set('search', q);
  if (lang) params.set('languages', lang);
  params.set('page', String(page));

  // Gutenberg's own Romanian catalog is 5 books (confirmed live) — for a
  // Romanian search, merge in Wikisource's much larger catalog alongside it
  // rather than showing an almost-empty result set. Not a unified pagination
  // across two independent APIs (real complexity, not worth it for what's
  // fundamentally a content-gap fix) — page 1 shows both sources together,
  // "next" just keeps paging whichever source(s) still have more.
  //
  // Each source is caught independently (confirmed live: Gutendex times out
  // often enough from this network that a single combined try/catch would
  // have thrown away a perfectly good Wikisource result every time it did) —
  // only fail the whole request if BOTH sources come back empty.
  const wikisourcePromise = lang === 'ro'
    ? searchWikisource(q, page).catch((err) => {
        console.error('[library] Wikisource search failed (continuing with Gutenberg only):', err);
        return null;
      })
    : Promise.resolve(null);

  const gutenbergPromise = (async () => {
    const resp = await fetch(`${GUTENDEX_BASE}?${params.toString()}`, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!resp.ok) throw new Error(`Gutendex returned ${resp.status}`);
    return resp.json() as Promise<{ count: number; next: string | null; previous: string | null; results: GutendexBook[] }>;
  })().catch((err) => {
    console.error('[library] Gutendex search failed (continuing with Wikisource only, if any):', err);
    return null;
  });

  const [data, wikisourceResult] = await Promise.all([gutenbergPromise, wikisourcePromise]);

  if (!data && !wikisourceResult) {
    res.status(502).json({ error: 'Public library search is temporarily unavailable. Try again shortly.' });
    return;
  }

  const gutenbergBooks = data ? data.results.map(normalizeSearchResult) : [];
  const books = wikisourceResult ? [...wikisourceResult.books, ...gutenbergBooks] : gutenbergBooks;
  const count = (data?.count ?? 0) + (wikisourceResult?.count ?? 0);
  const hasNext = Boolean(data?.next) || Boolean(wikisourceResult?.hasNext);

  res.json({
    count,
    hasNext,
    hasPrevious: page > 1,
    page,
    books,
  });
}

/**
 * Gutendex's default ordering (no search/lang filter beyond languages) is by
 * download_count descending — i.e. "popular first" — so page 1 IS the
 * popular-books list. Used by the pre-cache job (server/mara-brain/
 * library-precache.ts) to warm the cache before anyone asks for these books.
 */
export async function listPopularBookIds(lang: string, limit: number): Promise<number[]> {
  const params = new URLSearchParams();
  if (lang) params.set('languages', lang);
  const resp = await fetch(`${GUTENDEX_BASE}?${params.toString()}`, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Gutendex returned ${resp.status}`);
  const data = await resp.json() as { results: GutendexBook[] };
  return data.results.slice(0, limit).map((b) => b.id);
}

function rowToCachedBook(row: Record<string, unknown>): CachedBook {
  return {
    id: Number(row.id),
    title: String(row.title),
    authors: JSON.parse(String(row.authors ?? '[]')),
    languages: JSON.parse(String(row.languages ?? '[]')),
    subjects: JSON.parse(String(row.subjects ?? '[]')),
    coverUrl: (row.cover_url as string | null) ?? null,
    content: String(row.content),
    contentFormat: String(row.content_format) === 'html' ? 'html' : 'text',
    wordCount: Number(row.word_count ?? 0),
    fetchedAt: Number(row.fetched_at ?? 0),
  };
}

export function getCachedBook(id: number): CachedBook | null {
  const row = rawSqlite.prepare('SELECT * FROM library_books_cache WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToCachedBook(row) : null;
}

// Gutenberg's HTML editions carry a full document (head, nav, license
// boilerplate). We only ever show plain reading text in the UI (no
// dangerouslySetInnerHTML — simpler and avoids trusting raw third-party
// markup), so this reduces any HTML fallback to plain paragraphs.
function stripHtmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|br|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  text = text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  return text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

export async function fetchAndCacheBook(id: number): Promise<CachedBook> {
  const metaResp = await fetch(`${GUTENDEX_BASE}${id}/`, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!metaResp.ok) throw new Error(metaResp.status === 404 ? 'Book not found' : `Gutendex returned ${metaResp.status}`);
  const meta = await metaResp.json() as GutendexBook;

  const plainUrl = meta.formats['text/plain; charset=utf-8'] ?? meta.formats['text/plain; charset=us-ascii'] ?? meta.formats['text/plain'];
  const htmlUrl = meta.formats['text/html; charset=utf-8'] ?? meta.formats['text/html'];
  const contentUrl = plainUrl ?? htmlUrl;
  if (!contentUrl) throw new Error('No readable text format is available for this book');
  // Validate before fetching — see GUTENBERG_CONTENT_DOMAINS above. Only the
  // URL is checked here (host allowlist + resolves to a public IP); the
  // actual request below keeps its own timeout/headers rather than the
  // shorter generic ones in ssrf-guard's own fetchAllowedExternalUrl, since
  // Gutenberg's mirrors are known to need more room (see TEXT_FETCH_TIMEOUT_MS).
  const safeContentUrl = await assertSafeExternalUrl(contentUrl, GUTENBERG_CONTENT_DOMAINS);

  const textResp = await fetch(safeContentUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(TEXT_FETCH_TIMEOUT_MS) });
  if (!textResp.ok) throw new Error(`Failed to download book text (${textResp.status})`);
  const buf = await textResp.arrayBuffer();
  if (buf.byteLength > MAX_CONTENT_BYTES) throw new Error('This book exceeds the size limit for in-platform reading');

  let content = Buffer.from(buf).toString('utf8');
  if (!plainUrl) content = stripHtmlToText(content);
  // Gutenberg's plain-text editions use Windows line endings (\r\n\r\n
  // between paragraphs) — normalize once here so every consumer (the
  // reader's client-side pagination in particular) can rely on plain \n\n.
  content = content.replace(/\r\n/g, '\n').trim();
  if (!content) throw new Error('Downloaded book text was empty');

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const fetchedAt = Math.floor(Date.now() / 1000);
  const record = {
    id,
    title: meta.title,
    authors: JSON.stringify(meta.authors.map((a) => a.name)),
    languages: JSON.stringify(meta.languages),
    subjects: JSON.stringify(meta.subjects.slice(0, 10)),
    coverUrl: meta.formats['image/jpeg'] ?? null,
    content,
    contentFormat: 'text',
    wordCount,
    fetchedAt,
  };
  rawSqlite.prepare(`
    INSERT INTO library_books_cache (id, title, authors, languages, subjects, cover_url, content, content_format, word_count, fetched_at)
    VALUES (@id, @title, @authors, @languages, @subjects, @coverUrl, @content, @contentFormat, @wordCount, @fetchedAt)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, authors=excluded.authors, languages=excluded.languages, subjects=excluded.subjects,
      cover_url=excluded.cover_url, content=excluded.content, content_format=excluded.content_format,
      word_count=excluded.word_count, fetched_at=excluded.fetched_at
  `).run(record);

  return getCachedBook(id)!;
}

export async function readLibraryBook(req: any, res: any) {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid book id' });

  try {
    let book = getCachedBook(id);
    let cached = Boolean(book);
    if (!book) {
      book = isWikisourceId(id) ? await fetchAndCacheWikisourceBook(id) : await fetchAndCacheBook(id);
      cached = false;
    }

    // Reading itself needs no account (open to everyone) — but if the
    // request IS authenticated and this book is in the user's library,
    // hand back where they left off so the reader can jump straight there.
    const userId = (req as any).user?.uid ?? null;
    let resumePage: number | null = null;
    let savedByUser = false;
    if (userId) {
      const saved = rawSqlite.prepare('SELECT last_page FROM user_library_books WHERE user_id = ? AND book_id = ?').get(userId, id) as { last_page: number } | undefined;
      if (saved) {
        savedByUser = true;
        resumePage = saved.last_page;
      }
    }

    res.json({
      id: book.id,
      title: book.title,
      authors: book.authors,
      languages: book.languages,
      subjects: book.subjects,
      coverUrl: book.coverUrl,
      content: book.content,
      wordCount: book.wordCount,
      servedFromCache: cached,
      savedByUser,
      resumePage,
    });
  } catch (err) {
    console.error(`[library] read failed for book ${id}:`, err);
    const message = err instanceof Error ? err.message : 'Failed to load this book';
    res.status(502).json({ error: message });
  }
}

interface SavedLibraryRow {
  book_id: number;
  book_title: string;
  book_authors: string;
  book_cover_url: string | null;
  last_page: number;
  total_pages: number;
  added_at: number;
  updated_at: number;
}

/** "Add to My Library" — a bookmark that also starts reading-position tracking for this book. */
export async function saveBookToLibrary(req: any, res: any) {
  const userId = (req as any).user?.uid ?? null;
  if (!userId) return res.status(401).json({ error: 'Sign in to save books to your library' });
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid book id' });
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 500) : '';
  if (!title) return res.status(400).json({ error: 'title is required' });
  const authors = Array.isArray(req.body?.authors)
    ? req.body.authors.filter((a: unknown): a is string => typeof a === 'string').slice(0, 20)
    : [];
  const coverUrl = typeof req.body?.coverUrl === 'string' ? req.body.coverUrl.slice(0, 1000) : null;

  try {
    rawSqlite.prepare(`
      INSERT INTO user_library_books (user_id, book_id, book_title, book_authors, book_cover_url, added_at, updated_at)
      VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(user_id, book_id) DO UPDATE SET
        book_title = excluded.book_title, book_authors = excluded.book_authors, book_cover_url = excluded.book_cover_url
    `).run(userId, id, title, JSON.stringify(authors), coverUrl);
    res.json({ saved: true });
  } catch (err) {
    console.error('[library] save failed:', err);
    res.status(500).json({ error: 'Failed to save this book' });
  }
}

export async function removeBookFromLibrary(req: any, res: any) {
  const userId = (req as any).user?.uid ?? null;
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid book id' });
  try {
    rawSqlite.prepare('DELETE FROM user_library_books WHERE user_id = ? AND book_id = ?').run(userId, id);
    res.json({ saved: false });
  } catch (err) {
    console.error('[library] remove failed:', err);
    res.status(500).json({ error: 'Failed to remove this book' });
  }
}

export async function listMyLibraryBooks(req: any, res: any) {
  const userId = (req as any).user?.uid ?? null;
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  try {
    const rows = rawSqlite
      .prepare(`
        SELECT book_id, book_title, book_authors, book_cover_url, last_page, total_pages, added_at, updated_at
        FROM user_library_books WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200
      `)
      .all(userId) as SavedLibraryRow[];
    res.json({
      books: rows.map((r) => ({
        id: r.book_id,
        title: r.book_title,
        authors: (() => { try { return JSON.parse(r.book_authors || '[]'); } catch { return []; } })(),
        coverUrl: r.book_cover_url,
        lastPage: r.last_page,
        totalPages: r.total_pages,
        addedAt: new Date(r.added_at * 1000).toISOString(),
        updatedAt: new Date(r.updated_at * 1000).toISOString(),
      })),
    });
  } catch (err) {
    console.error('[library] list mine failed:', err);
    res.status(500).json({ error: 'Failed to load your library' });
  }
}

/** Called as the reader turns pages — debounced client-side, silently a no-op if the book isn't saved. */
export async function updateReadingProgress(req: any, res: any) {
  const userId = (req as any).user?.uid ?? null;
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid book id' });
  const page = Number.parseInt(String(req.body?.page), 10);
  if (!Number.isFinite(page) || page < 0) return res.status(400).json({ error: 'page must be a non-negative integer' });
  const totalPagesRaw = Number.parseInt(String(req.body?.totalPages), 10);
  const totalPages = Number.isFinite(totalPagesRaw) && totalPagesRaw >= 0 ? totalPagesRaw : 0;

  try {
    const result = rawSqlite
      .prepare('UPDATE user_library_books SET last_page = ?, total_pages = ?, updated_at = unixepoch() WHERE user_id = ? AND book_id = ?')
      .run(page, totalPages, userId, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Book is not in your library' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[library] progress update failed:', err);
    res.status(500).json({ error: 'Failed to save reading progress' });
  }
}
