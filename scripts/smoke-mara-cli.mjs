/**
 * Smoke test for scripts/mara-cli.mjs.
 *
 * Exercises the full CLI auth + chat path against a locally running
 * backend (booted by CI before this script runs):
 *
 *   1. signs up a fresh user via /api/auth/signup
 *   2. runs `mara-cli "hello"` in one-shot mode with MARA_EMAIL / MARA_PASSWORD env
 *   3. asserts the CLI exits 0 and prints a non-empty reply
 *
 * The reply itself may be a degrade message ("catching my breath") when
 * the LLM provider is unreachable from the CI environment — that's fine.
 * What we're verifying here is that the CLI:
 *   - can speak the CSRF + cookie protocol against the real server
 *   - survives the round-trip without throwing
 *   - prints SOMETHING to stdout for the user to read
 *
 * Run as: MARAAI_BASE_URL=http://localhost:3001 node scripts/smoke-mara-cli.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.env.MARAAI_BASE_URL || 'http://localhost:3001';

let failures = 0;
function ok(msg) { console.log('OK    ' + msg); }
function fail(msg) { console.error('FAIL  ' + msg); failures += 1; }

const email = `smoke-cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = 'SmokeCliPass!42';
const name = 'Smoke CLI User';

// ---------------------------------------------------------------------------
// 1. Create a user via the same /api/auth/signup the CLI would log into.
// ---------------------------------------------------------------------------

const signup = await fetch(`${BASE}/api/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, name }),
});

if (signup.status !== 201) {
  const body = await signup.text();
  fail(`signup expected 201, got ${signup.status}: ${body}`);
  process.exit(1);
}
ok('signup created fresh user for CLI test');

// ---------------------------------------------------------------------------
// 2. Spawn the CLI in one-shot mode. We pass a private $HOME so the CLI
//    can't pick up a previously cached session and we get a deterministic
//    cold-start path (env credentials → login → POST chat).
// ---------------------------------------------------------------------------

const cliPath = path.resolve(__dirname, 'mara-cli.mjs');
const child = spawn(
  process.execPath,
  [cliPath, `--base-url=${BASE}`, '--module=general', '--language=en', 'hello mara'],
  {
    env: {
      ...process.env,
      MARA_EMAIL: email,
      MARA_PASSWORD: password,
      // Isolate the session cache so this run can't authenticate via a
      // stale cookie from a previous local invocation.
      HOME: '/tmp/mara-cli-smoke-home',
      // Defence-in-depth — if MARA_SESSION_COOKIE is set in the shell,
      // make sure we still exercise the email+password path.
      MARA_SESSION_COOKIE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let stdoutBuf = '';
let stderrBuf = '';
child.stdout.on('data', (b) => { stdoutBuf += b.toString('utf8'); });
child.stderr.on('data', (b) => { stderrBuf += b.toString('utf8'); });

const exitCode = await new Promise((resolve) => {
  child.on('close', (code) => resolve(code));
});

if (exitCode !== 0) {
  fail(`mara-cli exit ${exitCode}\nstdout=${stdoutBuf}\nstderr=${stderrBuf}`);
} else {
  ok('mara-cli exited 0');
}

if (!stdoutBuf.includes('authenticated as')) {
  fail(`expected stdout to confirm authentication, got: ${stdoutBuf}`);
} else {
  ok('mara-cli authenticated using MARA_EMAIL/MARA_PASSWORD');
}

// The reply may be a degrade message (no LLM) or a real one. Both are
// non-empty and longer than the "[mara-cli] base ..." banner.
const lines = stdoutBuf.split('\n').filter((l) => l && !l.startsWith('[mara-cli]'));
if (lines.length === 0) {
  fail(`expected at least one non-banner line in stdout, got: ${stdoutBuf}`);
} else {
  ok(`mara-cli printed a reply (first line: "${lines[0].slice(0, 80)}")`);
}

// ---------------------------------------------------------------------------
// 3. Re-run with cached session (no env vars) to prove the session.json
//    fallback works. The previous run wrote it under $HOME=/tmp/mara-cli-smoke-home.
// ---------------------------------------------------------------------------

const child2 = spawn(
  process.execPath,
  [cliPath, `--base-url=${BASE}`, '--module=general', '--language=en', 'still here?'],
  {
    env: {
      ...process.env,
      MARA_EMAIL: '',
      MARA_PASSWORD: '',
      MARA_SESSION_COOKIE: '',
      HOME: '/tmp/mara-cli-smoke-home',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let stdoutBuf2 = '';
let stderrBuf2 = '';
child2.stdout.on('data', (b) => { stdoutBuf2 += b.toString('utf8'); });
child2.stderr.on('data', (b) => { stderrBuf2 += b.toString('utf8'); });

const exitCode2 = await new Promise((resolve) => {
  child2.on('close', (code) => resolve(code));
});

if (exitCode2 !== 0) {
  fail(`mara-cli (cached session) exit ${exitCode2}\nstdout=${stdoutBuf2}\nstderr=${stderrBuf2}`);
} else if (!stdoutBuf2.includes('cached session')) {
  fail(`expected cached-session path, got: ${stdoutBuf2}`);
} else {
  ok('mara-cli reused cached session.json on second invocation');
}

if (failures > 0) {
  console.error(`\n${failures} smoke assertion(s) failed.`);
  process.exit(1);
}

console.log('\nAll mara-cli smoke assertions passed ✓');
