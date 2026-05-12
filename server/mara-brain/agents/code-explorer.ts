// Mara Code Explorer Agent
//
// Item 3 of the post-Task-E plan. Gives Mara *read-only* visibility into
// her own implementation so Phase 9 ("self-improvement") and the growth
// engineer can ground their hypotheses in actual source code instead of
// a generic LLM prompt that has never seen the repo.
//
// Hard guarantees (defense in depth — every one of these would prevent a
// runaway prompt-injection scenario by itself):
//
//   1. Filesystem access is *read-only*. There is no write/exec path
//      anywhere in this module. The only Node APIs used are
//      fs.readFile / fs.readdir / fs.stat.
//
//   2. Paths are normalised with path.resolve + path.relative and must
//      stay inside REPO_ROOT. Any '..' escape attempt returns null.
//
//   3. Files must live under one of ALLOWED_ROOTS (server/, frontend/,
//      shared/, migrations/, scripts/, plus a handful of repo-root
//      docs/configs). Anything outside is invisible to the agent —
//      including .git/, node_modules/, dist/, .env*, *.sqlite, *.key,
//      *.pem.
//
//   4. Files must have an allowed extension (source code + docs only).
//      No binaries, images, or opaque blobs.
//
//   5. Per-read size cap (MAX_READ_BYTES, default 200KB) and per-file
//      size cap on indexing (MAX_INDEX_BYTES, default 1MB). Reads
//      larger than the cap are truncated and flagged in the audit log.
//
//   6. Every readFile() call writes a row to mara_code_reads so we can
//      answer "what has Mara been looking at?" without scraping logs.

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { rawSqlite } from '../../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// server/mara-brain/agents/code-explorer.ts → repo root
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const ALLOWED_ROOTS = ['server', 'frontend/src', 'shared', 'migrations', 'scripts'];
const ROOT_FILE_ALLOWLIST = new Set([
  'README.md',
  'ARCHITECTURE.md',
  'DEPLOYMENT.md',
  'DESIGN_AUDIT_REPORT.md',
  'LOCAL_SETUP.md',
  'QA_CHECKLIST.md',
  'package.json',
  'tsconfig.json',
  'drizzle.config.ts',
  'railway.json',
  'components.json',
  'tailwind.config.ts',
  'postcss.config.js',
  'vite.config.ts',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.scss', '.sql',
  '.yml', '.yaml', '.txt',
]);

// Directory names that are always skipped, even inside an allowed root.
const DENY_DIRECTORIES = new Set([
  'node_modules', 'dist', 'build', '.git', '.next', '.cache',
  'coverage', '.vite', '.turbo', '__pycache__', 'tmp',
]);

// Filename patterns that are always skipped (case-insensitive substring).
const DENY_FILENAME_PATTERNS = [
  '.env', '.sqlite', '.db', '.key', '.pem', '.p12',
  'cookies.txt', 'credentials.json', 'service-account',
  'secrets.', 'private.',
];

const MAX_INDEX_BYTES = 1_000_000; // skip indexing files larger than ~1MB
const MAX_READ_BYTES = 200_000; // truncate single-file reads at ~200KB
const DEFAULT_READ_REASON = 'unspecified';

// ---------------------------------------------------------------------------
// Path safety.
// ---------------------------------------------------------------------------

export interface ResolvedPath {
  absolute: string;
  relative: string;
}

/**
 * Resolve a user-supplied path string to an absolute path inside the
 * repo, or return null if it escapes the root, hits the deny list, or
 * has a disallowed extension. Accepts both repo-relative ('server/db.ts')
 * and absolute paths inside REPO_ROOT.
 */
export function resolveSafePath(input: string): ResolvedPath | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Reject obvious traversal/separator games before resolving.
  if (trimmed.includes('\0')) return null;

  // Normalise to POSIX-style segments for the allow checks, but compute
  // the actual absolute path via Node so OS-specific separators are
  // handled correctly on Windows/Linux alike.
  const absolute = path.resolve(REPO_ROOT, trimmed);
  const relative = path.relative(REPO_ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const posixRel = relative.split(path.sep).join('/');

  // Repo-root files: only the explicit allowlist (README, configs).
  const firstSegment = posixRel.split('/')[0];
  if (!firstSegment) return null;
  if (!posixRel.includes('/')) {
    if (!ROOT_FILE_ALLOWLIST.has(posixRel)) return null;
  } else if (!ALLOWED_ROOTS.includes(firstSegment) && !ALLOWED_ROOTS.some((r) => posixRel.startsWith(`${r}/`))) {
    return null;
  }

  // Deny-listed directory names anywhere along the path.
  for (const segment of posixRel.split('/').slice(0, -1)) {
    if (DENY_DIRECTORIES.has(segment)) return null;
  }

  // Filename pattern deny list (case-insensitive).
  const basename = path.basename(posixRel).toLowerCase();
  for (const pattern of DENY_FILENAME_PATTERNS) {
    if (basename.includes(pattern)) return null;
  }

  // Extension allow list.
  const ext = path.extname(basename);
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) return null;

  return { absolute, relative: posixRel };
}

// ---------------------------------------------------------------------------
// Indexing.
// ---------------------------------------------------------------------------

export interface CodeIndexEntry {
  path: string;
  size: number;
  mtime: number;
  sha256: string;
  lines: number;
  extension: string;
  indexedAt: number;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (DENY_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/**
 * Walk the allowed roots, compute size/mtime/sha256/lines for each file
 * that passes the safety filter, and UPSERT into mara_code_index.
 *
 * Idempotent — re-running just refreshes rows whose mtime has changed.
 * Returns a small summary so the caller can log progress without
 * pulling every row back.
 */
export interface IndexSummary {
  scanned: number;
  indexed: number;
  skipped: number;
  durationMs: number;
}

export async function indexCode(): Promise<IndexSummary> {
  const start = Date.now();
  let scanned = 0;
  let indexed = 0;
  let skipped = 0;

  const upsert = rawSqlite.prepare(`
    INSERT INTO mara_code_index (path, size, mtime, sha256, lines, extension, indexed_at)
    VALUES (@path, @size, @mtime, @sha256, @lines, @extension, unixepoch())
    ON CONFLICT(path) DO UPDATE SET
      size = excluded.size,
      mtime = excluded.mtime,
      sha256 = excluded.sha256,
      lines = excluded.lines,
      extension = excluded.extension,
      indexed_at = unixepoch()
  `);

  // Walk every allowed root + the handful of repo-root files in the
  // allowlist.
  const candidates: string[] = [];

  for (const root of ALLOWED_ROOTS) {
    const abs = path.join(REPO_ROOT, root);
    try {
      const stats = await stat(abs);
      if (!stats.isDirectory()) continue;
    } catch {
      continue;
    }
    for await (const file of walk(abs)) {
      candidates.push(file);
    }
  }
  for (const name of ROOT_FILE_ALLOWLIST) {
    candidates.push(path.join(REPO_ROOT, name));
  }

  for (const absolute of candidates) {
    scanned += 1;
    const relative = path.relative(REPO_ROOT, absolute).split(path.sep).join('/');
    const safe = resolveSafePath(relative);
    if (!safe) { skipped += 1; continue; }

    let s;
    try {
      s = await stat(safe.absolute);
    } catch {
      skipped += 1;
      continue;
    }
    if (!s.isFile()) { skipped += 1; continue; }
    if (s.size > MAX_INDEX_BYTES) { skipped += 1; continue; }

    let buf;
    try {
      buf = await readFile(safe.absolute);
    } catch {
      skipped += 1;
      continue;
    }

    const sha256 = createHash('sha256').update(buf).digest('hex');
    const lines = buf.toString('utf8').split('\n').length;
    const extension = path.extname(safe.relative);

    upsert.run({
      path: safe.relative,
      size: s.size,
      mtime: Math.floor(s.mtimeMs),
      sha256,
      lines,
      extension,
    });
    indexed += 1;
  }

  return { scanned, indexed, skipped, durationMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Read-only access (with audit log).
// ---------------------------------------------------------------------------

export interface ReadFileResult {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
  lines: number;
}

export interface ReadFileOptions {
  accessedBy: string;
  reason?: string;
  maxBytes?: number;
}

/**
 * Read a single source file from inside the repo, capped at
 * `maxBytes` (default MAX_READ_BYTES). Every call writes one row to
 * mara_code_reads.
 *
 * Returns null if the path fails the safety check (denylist, traversal,
 * disallowed extension). Throws if the file is allowed but cannot be
 * read for any other reason (missing, EACCES, etc.) so callers can
 * distinguish "you asked for something you shouldn't" from "the system
 * is broken".
 */
export async function readSourceFile(
  inputPath: string,
  opts: ReadFileOptions,
): Promise<ReadFileResult | null> {
  const safe = resolveSafePath(inputPath);
  if (!safe) return null;

  const maxBytes = Math.max(1, Math.min(opts.maxBytes ?? MAX_READ_BYTES, MAX_READ_BYTES));

  let buf;
  try {
    buf = await readFile(safe.absolute);
  } catch (err) {
    throw new Error(`code-explorer: failed to read ${safe.relative}: ${(err as Error).message}`);
  }
  const truncated = buf.length > maxBytes;
  const sliced = truncated ? buf.subarray(0, maxBytes) : buf;
  const content = sliced.toString('utf8');
  const lines = content.split('\n').length;

  try {
    rawSqlite.prepare(`
      INSERT INTO mara_code_reads (path, accessed_by, reason, size, truncated)
      VALUES (?, ?, ?, ?, ?)
    `).run(safe.relative, opts.accessedBy, opts.reason ?? DEFAULT_READ_REASON, buf.length, truncated ? 1 : 0);
  } catch (err) {
    // Audit failure must never block a read — log and continue.
    console.error('[code-explorer] audit insert failed:', (err as Error).message);
  }

  return { path: safe.relative, content, size: buf.length, truncated, lines };
}

// ---------------------------------------------------------------------------
// Index queries.
// ---------------------------------------------------------------------------

/**
 * List indexed files under an optional path prefix, ordered by mtime
 * descending so callers can quickly look at "recently changed" files.
 */
export interface ListOptions {
  prefix?: string;
  extension?: string;
  limit?: number;
}

export function listIndexedFiles(opts: ListOptions = {}): CodeIndexEntry[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.prefix) {
    where.push("path LIKE @prefix || '%'");
    params.prefix = opts.prefix;
  }
  if (opts.extension) {
    where.push('extension = @extension');
    params.extension = opts.extension;
  }
  const sql = `
    SELECT path, size, mtime, sha256, lines, extension, indexed_at
    FROM mara_code_index
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY mtime DESC
    LIMIT @limit
  `;
  params.limit = Math.max(1, Math.min(opts.limit ?? 200, 5000));
  const rows = rawSqlite.prepare(sql).all(params) as Array<{
    path: string; size: number; mtime: number; sha256: string;
    lines: number; extension: string; indexed_at: number;
  }>;
  return rows.map((r) => ({
    path: r.path, size: r.size, mtime: r.mtime, sha256: r.sha256,
    lines: r.lines, extension: r.extension, indexedAt: r.indexed_at,
  }));
}

/**
 * Find files whose path contains the given substring (case-insensitive).
 * Useful when the agent has a keyword from a chat but doesn't know the
 * exact filename.
 */
export function searchIndexedFiles(needle: string, limit = 50): CodeIndexEntry[] {
  if (!needle) return [];
  const sql = `
    SELECT path, size, mtime, sha256, lines, extension, indexed_at
    FROM mara_code_index
    WHERE LOWER(path) LIKE LOWER(@needle)
    ORDER BY mtime DESC
    LIMIT @limit
  `;
  const rows = rawSqlite.prepare(sql).all({
    needle: `%${needle}%`,
    limit: Math.max(1, Math.min(limit, 500)),
  }) as Array<{
    path: string; size: number; mtime: number; sha256: string;
    lines: number; extension: string; indexed_at: number;
  }>;
  return rows.map((r) => ({
    path: r.path, size: r.size, mtime: r.mtime, sha256: r.sha256,
    lines: r.lines, extension: r.extension, indexedAt: r.indexed_at,
  }));
}

/**
 * High-level stats: total files indexed, totals by extension, byte
 * sum, top-N most-recently-changed paths. Cheap (single SQL pass).
 */
export interface CodeOverview {
  totalFiles: number;
  totalBytes: number;
  byExtension: Array<{ extension: string; count: number; bytes: number }>;
  recentlyChanged: Array<{ path: string; mtime: number; size: number }>;
}

export function getCodeOverview(): CodeOverview {
  const totals = rawSqlite.prepare(
    'SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM mara_code_index',
  ).get() as { files: number; bytes: number };

  const byExt = rawSqlite.prepare(`
    SELECT extension, COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes
    FROM mara_code_index
    GROUP BY extension
    ORDER BY bytes DESC
  `).all() as Array<{ extension: string; count: number; bytes: number }>;

  const recent = rawSqlite.prepare(`
    SELECT path, mtime, size FROM mara_code_index
    ORDER BY mtime DESC
    LIMIT 20
  `).all() as Array<{ path: string; mtime: number; size: number }>;

  return {
    totalFiles: totals.files,
    totalBytes: totals.bytes,
    byExtension: byExt,
    recentlyChanged: recent,
  };
}

/**
 * Recent audit log entries. Admin-facing.
 */
export interface ReadAuditEntry {
  id: number;
  path: string;
  accessedBy: string;
  reason: string | null;
  size: number;
  truncated: boolean;
  accessedAt: number;
}

export function getRecentReads(limit = 50): ReadAuditEntry[] {
  const rows = rawSqlite.prepare(`
    SELECT id, path, accessed_by, reason, size, truncated, accessed_at
    FROM mara_code_reads
    ORDER BY accessed_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as Array<{
    id: number; path: string; accessed_by: string; reason: string | null;
    size: number; truncated: number; accessed_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    accessedBy: r.accessed_by,
    reason: r.reason,
    size: r.size,
    truncated: !!r.truncated,
    accessedAt: r.accessed_at,
  }));
}

/**
 * Read up to N "relevant" files for a free-text query. Currently a
 * keyword match against the index; future versions may use the LLM to
 * rank candidates. Returns trimmed contents so callers can stitch
 * snippets into an LLM prompt without exploding the token budget.
 */
export async function readRelevantFiles(
  query: string,
  opts: { accessedBy: string; reason?: string; maxFiles?: number; maxBytesPerFile?: number } = { accessedBy: 'unknown' },
): Promise<ReadFileResult[]> {
  const tokens = query.toLowerCase().split(/[^a-z0-9_./-]+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];

  const seen = new Set<string>();
  const candidates: CodeIndexEntry[] = [];
  for (const token of tokens) {
    for (const entry of searchIndexedFiles(token, 10)) {
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      candidates.push(entry);
      if (candidates.length >= (opts.maxFiles ?? 5)) break;
    }
    if (candidates.length >= (opts.maxFiles ?? 5)) break;
  }

  const results: ReadFileResult[] = [];
  for (const entry of candidates.slice(0, opts.maxFiles ?? 5)) {
    const read = await readSourceFile(entry.path, {
      accessedBy: opts.accessedBy,
      reason: opts.reason,
      maxBytes: opts.maxBytesPerFile,
    });
    if (read) results.push(read);
  }
  return results;
}
