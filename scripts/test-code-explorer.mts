// Item 3 smoke test — code visibility agent.
//
// Verifies that:
//   1. resolveSafePath() blocks every dangerous category (traversal,
//      denylisted directories, .env/.sqlite/.key filenames, unknown
//      file extensions) and allows the obvious ones.
//   2. indexCode() walks the repo and produces a non-trivial number of
//      rows in mara_code_index with valid sha256/size/lines.
//   3. readSourceFile() returns content for an allowed path, truncates
//      at maxBytes, and writes one row to mara_code_reads per call.
//   4. The HTTP admin endpoints respect requireAdmin (403 for a
//      non-admin user) and serve overview/index/file for an admin.
//
// Run as part of CI via `npm run smoke:code-explorer`.

import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';

// Use a port outside the CI backend's fallback range (3001-3021) so we
// never collide when this test runs alongside the shared backend.
const PORT = Number(process.env.SMOKE_PORT || 3122);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = `admin-smoke-${Date.now()}@example.com`;
const ADMIN_PASSWORD = `Smoke!${randomBytes(6).toString('hex')}`;
const NORMAL_EMAIL = `user-smoke-${Date.now()}@example.com`;
const NORMAL_PASSWORD = `Smoke!${randomBytes(6).toString('hex')}`;

let failures = 0;
const ok = (msg: string) => console.log(`OK    ${msg}`);
const fail = (msg: string) => { failures += 1; console.error(`FAIL  ${msg}`); };

// ---------------------------------------------------------------------------
// Phase 1: pure agent tests (no HTTP).
// ---------------------------------------------------------------------------

async function testAgent() {
  const mod = await import('../server/mara-brain/agents/code-explorer.js');
  const {
    resolveSafePath, indexCode, readSourceFile, listIndexedFiles,
    searchIndexedFiles, getCodeOverview, getRecentReads,
  } = mod;

  // 1a: safety — accept canonical paths.
  if (!resolveSafePath('server/db.ts')) fail('resolveSafePath rejected server/db.ts');
  else ok('resolveSafePath allows server/db.ts');

  if (!resolveSafePath('frontend/src/App.tsx')) fail('resolveSafePath rejected frontend/src/App.tsx');
  else ok('resolveSafePath allows frontend/src/App.tsx');

  if (!resolveSafePath('README.md')) fail('resolveSafePath rejected README.md');
  else ok('resolveSafePath allows README.md');

  // 1b: safety — reject traversal/denylist.
  const denials: Array<[string, string]> = [
    ['../../../etc/passwd', 'parent traversal'],
    ['/etc/passwd', 'absolute /etc path'],
    ['server/.env', '.env filename'],
    ['server/.env.local', '.env variant'],
    ['data/foo.sqlite', '.sqlite filename'],
    ['certs/private.key', '.key filename'],
    ['node_modules/express/index.js', 'node_modules in path'],
    ['frontend/dist/assets/index.js', 'dist in path'],
    ['.git/HEAD', '.git in path'],
    ['scripts/runtime.exe', 'disallowed extension .exe'],
    ['/etc/hosts\0server/db.ts', 'null byte'],
    ['random-root.md', 'unlisted repo-root file'],
    ['', 'empty path'],
  ];
  for (const [p, reason] of denials) {
    const got = resolveSafePath(p);
    if (got) fail(`resolveSafePath SHOULD have rejected (${reason}): "${p}" → ${got.relative}`);
  }
  ok(`resolveSafePath rejected ${denials.length} dangerous patterns`);

  // 2: indexCode populates the table.
  const summary = await indexCode();
  if (summary.indexed < 50) fail(`indexCode indexed only ${summary.indexed} files — expected >= 50`);
  else ok(`indexCode indexed ${summary.indexed}/${summary.scanned} files (skipped ${summary.skipped}) in ${summary.durationMs}ms`);

  // 3: getCodeOverview reflects the index.
  const overview = getCodeOverview();
  if (overview.totalFiles < 50) fail(`overview.totalFiles=${overview.totalFiles} too low`);
  else ok(`overview reports ${overview.totalFiles} files, ${(overview.totalBytes / 1024).toFixed(0)} KB`);
  if (!overview.byExtension.find((e: any) => e.extension === '.ts')) fail('overview missing .ts bucket');
  else ok('overview has .ts bucket');

  // 4: searchIndexedFiles finds known files.
  const matches = searchIndexedFiles('growth-engineer', 10);
  if (!matches.find((m: any) => m.path === 'server/mara-brain/agents/growth-engineer.ts')) {
    fail('searchIndexedFiles missed growth-engineer.ts');
  } else {
    ok('searchIndexedFiles found growth-engineer.ts');
  }

  // 5: readSourceFile returns content + writes audit log.
  const before = getRecentReads(5).length;
  const read = await readSourceFile('server/mara-brain/agents/code-explorer.ts', {
    accessedBy: 'smoke-test',
    reason: 'verify read works',
    maxBytes: 500,
  });
  if (!read) fail('readSourceFile returned null for own source');
  else {
    if (read.content.length === 0) fail('readSourceFile content empty');
    else ok(`readSourceFile read ${read.size} bytes (got ${read.content.length} after maxBytes truncation)`);
    if (read.size > 500 && !read.truncated) fail('truncated flag wrong');
    else ok('truncated flag matches maxBytes cap');
  }
  const after = getRecentReads(5);
  if (after.length === before) fail('readSourceFile did not write audit row');
  else if (after[0]?.accessedBy !== 'smoke-test') fail(`audit row accessedBy=${after[0]?.accessedBy}`);
  else ok(`audit row recorded for ${after[0].path} (accessed_by=smoke-test)`);

  // 6: readSourceFile denies dangerous paths.
  const denied = await readSourceFile('../../etc/passwd', { accessedBy: 'smoke' });
  if (denied !== null) fail('readSourceFile allowed traversal');
  else ok('readSourceFile returned null for traversal');

  const deniedEnv = await readSourceFile('server/.env', { accessedBy: 'smoke' });
  if (deniedEnv !== null) fail('readSourceFile allowed .env');
  else ok('readSourceFile returned null for .env');

  // 7: listIndexedFiles with prefix.
  const serverFiles = listIndexedFiles({ prefix: 'server/', limit: 500 });
  if (serverFiles.length < 20) fail(`listIndexedFiles prefix=server/ only returned ${serverFiles.length}`);
  else ok(`listIndexedFiles prefix=server/ returned ${serverFiles.length} entries`);
}

// ---------------------------------------------------------------------------
// Phase 2: HTTP admin endpoints.
// ---------------------------------------------------------------------------

interface SpawnedServer {
  proc: ChildProcess;
  kill: () => void;
}

async function startServer(): Promise<SpawnedServer> {
  const proc = spawn(
    'npx',
    ['tsx', 'server/index.ts'],
    {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: {
        ...process.env,
        PORT: String(PORT),
        DATABASE_FILE: `/tmp/mara-code-explorer-smoke-${Date.now()}.sqlite`,
        SESSION_SECRET: 'smoke-test-session-secret',
        ADMIN_EMAILS: ADMIN_EMAIL,
        BRAIN_AUTOSTART: 'false',
        MARA_LEARNING_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  // wait until /api/runtime answers
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/runtime`);
      if (r.ok) return { proc, kill: () => proc.kill() };
    } catch {
      // not ready yet
    }
    await delay(500);
  }
  proc.kill();
  throw new Error('backend did not come up within 30s');
}

interface Jar {
  cookie: string;
  csrf?: string;
}

async function request(jar: Jar, method: string, urlPath: string, body?: unknown) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Cookie: jar.cookie,
  };
  if (jar.csrf && method !== 'GET') headers['X-CSRF-Token'] = jar.csrf;

  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/connect\.sid=[^;]+/);
    if (match) jar.cookie = match[0];
  }

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, body: json ?? text };
}

async function login(jar: Jar, email: string, password: string) {
  // get csrf
  const csrf = await request(jar, 'GET', '/api/auth/csrf');
  if (csrf.status !== 200) throw new Error(`csrf ${csrf.status}`);
  jar.csrf = csrf.body.csrfToken;

  // signup (idempotent — login will work if it already exists)
  await request(jar, 'POST', '/api/auth/signup', {
    email, password, name: email.split('@')[0],
  });
  const login = await request(jar, 'POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login ${login.status}: ${JSON.stringify(login.body)}`);
  // refresh csrf because regenerate() rotated session
  const csrf2 = await request(jar, 'GET', '/api/auth/csrf');
  jar.csrf = csrf2.body.csrfToken;
}

async function testHttp() {
  const server = await startServer();
  try {
    // Admin login.
    const adminJar: Jar = { cookie: '' };
    await login(adminJar, ADMIN_EMAIL, ADMIN_PASSWORD);
    ok(`logged in as admin (${ADMIN_EMAIL})`);

    // Normal user login.
    const userJar: Jar = { cookie: '' };
    await login(userJar, NORMAL_EMAIL, NORMAL_PASSWORD);
    ok(`logged in as normal user (${NORMAL_EMAIL})`);

    // Non-admin must get 403 on every code endpoint.
    const guarded = [
      ['GET', '/api/admin/mara/code/overview'],
      ['GET', '/api/admin/mara/code/index?limit=5'],
      ['GET', '/api/admin/mara/code/search?q=growth'],
      ['GET', '/api/admin/mara/code/file?path=README.md'],
      ['GET', '/api/admin/mara/code/reads'],
    ] as const;
    for (const [m, u] of guarded) {
      const r = await request(userJar, m, u);
      if (r.status !== 403) fail(`non-admin should 403 on ${u}, got ${r.status}`);
    }
    ok(`non-admin gets 403 on all ${guarded.length} code endpoints`);

    // Reindex via admin endpoint.
    const reindex = await request(adminJar, 'POST', '/api/admin/mara/code/reindex', {});
    if (reindex.status !== 200) fail(`POST reindex ${reindex.status}: ${JSON.stringify(reindex.body)}`);
    else if (!reindex.body.indexed) fail('reindex returned no indexed count');
    else ok(`POST /reindex indexed ${reindex.body.indexed} files`);

    const overview = await request(adminJar, 'GET', '/api/admin/mara/code/overview');
    if (overview.status !== 200) fail(`overview ${overview.status}`);
    else if (overview.body.totalFiles < 50) fail(`overview totalFiles ${overview.body.totalFiles}`);
    else ok(`GET /overview returned ${overview.body.totalFiles} files`);

    const index = await request(adminJar, 'GET', '/api/admin/mara/code/index?prefix=server/&limit=10');
    if (index.status !== 200) fail(`index ${index.status}`);
    else if (!Array.isArray(index.body.files) || index.body.files.length === 0) fail('index files empty');
    else ok(`GET /index?prefix=server/ returned ${index.body.files.length} files`);

    const search = await request(adminJar, 'GET', '/api/admin/mara/code/search?q=code-explorer');
    if (search.status !== 200) fail(`search ${search.status}`);
    else if (!search.body.files.some((f: any) => f.path.includes('code-explorer'))) fail('search did not find code-explorer');
    else ok('GET /search?q=code-explorer found the file');

    const file = await request(adminJar, 'GET', '/api/admin/mara/code/file?path=server/mara-brain/agents/code-explorer.ts&maxBytes=500');
    if (file.status !== 200) fail(`file ${file.status}`);
    else if (!file.body.content || file.body.content.length === 0) fail('file content empty');
    else if (file.body.size <= 500 && file.body.truncated) fail('truncated flag wrong');
    else ok(`GET /file returned ${file.body.content.length} bytes (size=${file.body.size}, truncated=${file.body.truncated})`);

    // Path safety via HTTP: traversal MUST 404 (resolveSafePath returns null).
    const traversal = await request(adminJar, 'GET', '/api/admin/mara/code/file?path=../../../etc/passwd');
    if (traversal.status !== 404) fail(`traversal via HTTP got ${traversal.status} instead of 404`);
    else ok('GET /file rejects ../../etc/passwd with 404');

    const envBlocked = await request(adminJar, 'GET', '/api/admin/mara/code/file?path=server/.env');
    if (envBlocked.status !== 404) fail(`server/.env via HTTP got ${envBlocked.status} instead of 404`);
    else ok('GET /file rejects server/.env with 404');

    // Audit log shows our admin reads.
    const reads = await request(adminJar, 'GET', '/api/admin/mara/code/reads?limit=10');
    if (reads.status !== 200) fail(`reads ${reads.status}`);
    else if (!Array.isArray(reads.body.reads) || reads.body.reads.length === 0) fail('reads list empty');
    else if (!reads.body.reads.some((r: any) => r.path === 'server/mara-brain/agents/code-explorer.ts')) fail('audit did not record our read');
    else ok(`GET /reads shows ${reads.body.reads.length} audit entries including our request`);
  } finally {
    server.kill();
  }
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------

(async () => {
  await testAgent();
  await testHttp();
  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll code-explorer smoke assertions passed ✓');
  process.exit(0);
})().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
