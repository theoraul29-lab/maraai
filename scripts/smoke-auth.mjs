/**
 * Smoke test for the auth flow that PR #95 + PR #101 hardened:
 *
 *  - `/api/auth/me` consistently returns `{ user: null }` for anonymous
 *    sessions so the SPA can detect "server says you're logged out" and
 *    drop stale localStorage (the silent-fail root cause).
 *
 *  - `/api/auth/signup` and `/api/auth/login` echo back a populated
 *    `tier` field, so the SPA's "trust server tier" path in
 *    AuthContext.login() actually sees a non-empty value.
 *
 *  - Logout invalidates the session immediately (next /api/auth/me
 *    returns null), preventing the "stale localStorage + valid cookie"
 *    state that confused returning users.
 *
 * Usage: MARAAI_BASE_URL=http://localhost:3001 node scripts/smoke-auth.mjs
 */

const BASE = process.env.MARAAI_BASE_URL || 'http://localhost:3001';

let failures = 0;
function ok(msg) {
  console.log('OK    ' + msg);
}
function fail(msg) {
  console.error('FAIL  ' + msg);
  failures += 1;
}

// connect-sqlite3 sets a cookie on the very first request. We hold it
// across the whole flow so signup -> me -> logout -> me work like a
// single browser session.
let cookieJar = '';
function recordCookies(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return;
  // Node fetch concatenates multiple Set-Cookie headers with ', '. We
  // only care about connect.sid for the auth tests, so we cherry-pick.
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
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  recordCookies(res);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text };
  }
  return { status: res.status, body: parsed };
}

const email = `smoke-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = 'SmokeAuthPass!42';
const name = 'Smoke Auth User';

try {
  // 1. Brand-new browser: /api/auth/me must return { user: null }.
  let r = await call('GET', '/api/auth/me');
  if (r.status !== 200) fail(`anon /me expected 200, got ${r.status}`);
  else if (r.body?.user !== null) fail(`anon /me must return user:null, got ${JSON.stringify(r.body)}`);
  else ok('anon /me returns user:null');

  // 2. Signup populates the session and returns a usable user payload.
  r = await call('POST', '/api/auth/signup', { email, password, name });
  if (r.status !== 201) fail(`signup expected 201, got ${r.status} body=${JSON.stringify(r.body)}`);
  else if (!r.body || !r.body.id) fail(`signup body missing id: ${JSON.stringify(r.body)}`);
  else if (typeof r.body.tier !== 'string' || r.body.tier.length === 0)
    fail(`signup body must include non-empty tier, got ${JSON.stringify(r.body)}`);
  else ok(`signup OK (id=${r.body.id.slice(0, 8)}\u2026, tier=${r.body.tier})`);

  const userId = r.body?.id;

  // 3. /api/auth/me now returns the authenticated user.
  r = await call('GET', '/api/auth/me');
  if (r.status !== 200) fail(`authed /me expected 200, got ${r.status}`);
  else if (!r.body?.user || r.body.user.id !== userId)
    fail(`authed /me must echo the same user id, got ${JSON.stringify(r.body)}`);
  else if (typeof r.body.user.tier !== 'string' || r.body.user.tier.length === 0)
    fail(`authed /me user.tier must be a non-empty string, got ${JSON.stringify(r.body.user)}`);
  else ok(`authed /me echoes user (tier=${r.body.user.tier})`);

  // 4. Logout server-side, then /api/auth/me must immediately drop
  //    back to user:null so the SPA's mount-time effect clears stale
  //    localStorage.
  r = await call('POST', '/api/auth/logout');
  if (r.status !== 200) fail(`logout expected 200, got ${r.status}`);
  else ok('logout 200');

  r = await call('GET', '/api/auth/me');
  if (r.status !== 200) fail(`post-logout /me expected 200, got ${r.status}`);
  else if (r.body?.user !== null)
    fail(`post-logout /me must return user:null, got ${JSON.stringify(r.body)}`);
  else ok('post-logout /me returns user:null');

  // 5. Re-login as the same email must succeed and echo a non-empty
  //    tier (so the SPA's "trust server tier" path kicks in instead of
  //    falling back to a fresh 1-hour trial window every time).
  r = await call('POST', '/api/auth/login', { email, password });
  if (r.status !== 200) fail(`login expected 200, got ${r.status} body=${JSON.stringify(r.body)}`);
  else if (!r.body || r.body.id !== userId)
    fail(`login must return same user id, got ${JSON.stringify(r.body)}`);
  else if (typeof r.body.tier !== 'string' || r.body.tier.length === 0)
    fail(`login body must include non-empty tier, got ${JSON.stringify(r.body)}`);
  else ok(`login OK (tier=${r.body.tier})`);

  // 6. Wrong password must return 401 + an error message the SPA can
  //    display — this is the path that "failed silently" before the
  //    AuthContext fix, because the response shape was right but the
  //    SPA had no UI to render the message in some flows.
  r = await call('POST', '/api/auth/login', { email, password: 'definitely-wrong' });
  if (r.status !== 401) fail(`wrong-password login expected 401, got ${r.status}`);
  else if (!r.body?.message) fail(`wrong-password login must include message, got ${JSON.stringify(r.body)}`);
  else ok(`wrong-password login returns 401 + message`);
} catch (err) {
  fail(`unexpected exception: ${err?.stack || err}`);
}

if (failures > 0) {
  console.error(`\n${failures} smoke-auth test(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll smoke-auth tests passed');
}
