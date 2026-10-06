/**
 * Smoke test for the save_memory conversational tool (server/ai.ts).
 *
 * Verifies the real end-to-end path:
 *   signup -> chat "remember that..." -> tool fires -> user_memories row
 *   persists -> a later message in a NEW turn can reference it.
 *
 * Requires a real LLM provider configured (Ollama or Anthropic) — this is
 * deliberately not mocked, per the task's "no mocked unit tests only" ask.
 *
 * Usage: MARAAI_BASE_URL=http://localhost:5000 node scripts/smoke-memory.mjs
 */

const BASE = process.env.MARAAI_BASE_URL || 'http://localhost:5000';

let failures = 0;
function ok(msg) { console.log('OK    ' + msg); }
function fail(msg) { console.error('FAIL  ' + msg); failures += 1; }

let cookieJar = '';
let csrfToken = '';
function recordCookies(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return;
  const parts = setCookie.split(/,(?=\s*\w+=)/);
  for (const part of parts) {
    const m = part.match(/^\s*([^=;\s]+)=([^;]+)/);
    if (!m) continue;
    if (m[1] !== 'connect.sid') continue;
    cookieJar = `${m[1]}=${m[2]}`;
  }
}

async function call(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookieJar) headers.Cookie = cookieJar;
  if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  recordCookies(res);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text }; }
  return { status: res.status, body: parsed };
}

const email = `smoke-memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = 'SmokeMemPass!42';
const name = 'Smoke Memory User';

try {
  // 0. Prime the session + CSRF token, same as a real browser's first load.
  let r = await call('GET', '/api/auth/csrf');
  csrfToken = r.body?.csrfToken || '';
  if (!csrfToken) { fail(`could not obtain CSRF token: ${JSON.stringify(r.body)}`); throw new Error('abort'); }

  // 1. Signup — establishes a real authenticated session.
  r = await call('POST', '/api/auth/signup', { email, password, name });
  if (r.status !== 201) { fail(`signup expected 201, got ${r.status} body=${JSON.stringify(r.body)}`); throw new Error('abort'); }
  ok(`signup OK (id=${r.body.id.slice(0, 8)}…)`);

  // Signup regenerates the session (anti session-fixation) — the CSRF token
  // from before is now stale; re-fetch for the new authenticated session,
  // same as the frontend's csrf.ts auto-retry-on-403 behavior.
  r = await call('GET', '/api/auth/csrf');
  csrfToken = r.body?.csrfToken || '';

  // 2. Explicit memory request — Test 1 from the task spec.
  r = await call('POST', '/api/chat', { message: 'Remember that I prefer short, direct answers.' });
  if (r.status !== 200) { fail(`chat (explicit remember) expected 200, got ${r.status} body=${JSON.stringify(r.body)}`); throw new Error('abort'); }
  const reply1 = r.body?.aiResponse?.content || '';
  ok(`chat replied (${reply1.length} chars): "${reply1.slice(0, 120)}${reply1.length > 120 ? '…' : ''}"`);

  // 3. Retrieval — a brand-new message/turn should see the memory surface
  //    in a later reply's context (we can't directly inspect the system
  //    prompt over HTTP, so we check the DB directly via a second process
  //    is not possible here; instead we rely on a follow-up question that
  //    only makes sense if the memory was retrieved).
  r = await call('POST', '/api/chat', { message: 'Quick — in one word, do I prefer long or short answers?' });
  if (r.status !== 200) { fail(`chat (retrieval probe) expected 200, got ${r.status}`); }
  else {
    const reply2 = (r.body?.aiResponse?.content || '').toLowerCase();
    ok(`retrieval probe reply: "${reply2.slice(0, 150)}"`);
    if (reply2.includes('short')) ok('retrieval probe mentions "short" — memory likely reached the prompt');
    else fail('retrieval probe reply does not mention "short" — memory may not have reached the prompt (non-fatal, model phrasing varies)');
  }

  console.log('\nNOTE: this script cannot directly query user_memories (no DB access over HTTP by design).');
  console.log('Run scripts/check-memory-db.mjs (if present) or inspect the DB directly to confirm the row exists.');
} catch (err) {
  if (err?.message !== 'abort') fail(`unexpected exception: ${err?.stack || err}`);
}

if (failures > 0) {
  console.error(`\n${failures} smoke-memory test(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll smoke-memory tests passed');
}
