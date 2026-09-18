/**
 * Smoke test for the change-password and account-deletion flows added this
 * session (server/modules/auth-api.ts's changePasswordHandler,
 * server/modules/profile.ts's deleteAccount + sweepPendingAccountDeletions).
 * Neither had any automated coverage before this — both are auth-adjacent
 * and real money/data is not at risk here (unlike the billing endpoints),
 * so this exercises the full flow end to end against a real, disposable
 * test account rather than just validation edges.
 *
 * Usage: MARAAI_BASE_URL=http://localhost:3001 node scripts/smoke-account.mjs
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

// Same single-cookie-jar approach as smoke-auth.mjs — one simulated browser
// session carried across the whole flow.
let cookieJar = '';
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
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

const email = `smoke-account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = 'SmokeAccountPass!42';
const newPassword = 'SmokeAccountPass!43';
const name = 'Smoke Account User';

try {
  // 1. Fresh account via signup (mirrors smoke-auth.mjs).
  let r = await call('POST', '/api/auth/signup', { email, password, name });
  if (r.status !== 201 || !r.body?.id) fail(`signup expected 201 with id, got ${r.status} body=${JSON.stringify(r.body)}`);
  else ok(`signup OK (id=${r.body.id.slice(0, 8)}…)`);
  const userId = r.body?.id;

  // 2. /api/auth/me should report hasPassword:true for a local-auth account
  //    — SettingsModal's delete-account flow uses this to decide whether to
  //    show the password-confirmation field.
  r = await call('GET', '/api/auth/me');
  if (r.status !== 200 || r.body?.user?.hasPassword !== true)
    fail(`/me after signup should report hasPassword:true, got ${JSON.stringify(r.body)}`);
  else ok('/me reports hasPassword:true for local-auth account');

  // 3. Change password with the WRONG current password must be rejected.
  r = await call('POST', '/api/auth/change-password', { currentPassword: 'not-the-real-password', newPassword });
  if (r.status !== 401 || r.body?.code !== 'current_password_invalid')
    fail(`change-password with wrong current password expected 401/current_password_invalid, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('change-password rejects wrong current password (401)');

  // 4. Change password with the correct current password succeeds.
  r = await call('POST', '/api/auth/change-password', { currentPassword: password, newPassword });
  if (r.status !== 200) fail(`change-password expected 200, got ${r.status} body=${JSON.stringify(r.body)}`);
  else ok('change-password succeeds with correct current password');

  // 5. Old password no longer works; new password does — proves the DB was
  //    actually updated, not just a 200 with no real effect.
  cookieJar = ''; // force a fresh session for a clean login attempt
  r = await call('POST', '/api/auth/login', { email, password });
  if (r.status !== 401) fail(`login with OLD password should now fail (401), got ${r.status}`);
  else ok('old password no longer works after change-password');

  r = await call('POST', '/api/auth/login', { email, password: newPassword });
  if (r.status !== 200 || r.body?.id !== userId) fail(`login with NEW password expected 200 + same user id, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('new password works after change-password');

  // 6. Delete-account without a password must be rejected (local-auth
  //    accounts require confirmation).
  r = await call('DELETE', '/api/profile/me', {});
  if (r.status !== 400 || r.body?.error !== 'password_required')
    fail(`delete without password expected 400/password_required, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('delete-account rejects request with no password (400)');

  // 7. Delete-account with the WRONG password must be rejected.
  r = await call('DELETE', '/api/profile/me', { password: 'still-not-the-real-password' });
  if (r.status !== 401 || r.body?.error !== 'invalid_password')
    fail(`delete with wrong password expected 401/invalid_password, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('delete-account rejects wrong password (401)');

  // 8. Delete-account with the correct (new) password schedules deletion —
  //    does NOT wipe immediately (the 7-day grace period).
  r = await call('DELETE', '/api/profile/me', { password: newPassword });
  if (r.status !== 200 || typeof r.body?.scheduledFor !== 'number')
    fail(`delete with correct password expected 200 + scheduledFor, got ${r.status} ${JSON.stringify(r.body)}`);
  else {
    const daysOut = (r.body.scheduledFor - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysOut < 6.9 || daysOut > 7.1) fail(`scheduledFor should be ~7 days out, was ${daysOut.toFixed(2)} days`);
    else ok(`delete-account schedules deletion ~7 days out (${daysOut.toFixed(2)}d), does not wipe immediately`);
  }

  // 9. The session is destroyed as part of scheduling deletion — the next
  //    /me on this cookie must be anonymous.
  r = await call('GET', '/api/auth/me');
  if (r.status !== 200 || r.body?.user !== null)
    fail(`/me right after delete-account should be user:null, got ${JSON.stringify(r.body)}`);
  else ok('session is destroyed immediately after scheduling deletion');

  // 10. Logging back in during the grace period must cancel the scheduled
  //     deletion (reactivated:true) rather than requiring the account to
  //     stay gone until the sweep runs.
  cookieJar = '';
  r = await call('POST', '/api/auth/login', { email, password: newPassword });
  if (r.status !== 200 || r.body?.id !== userId) fail(`login during grace period expected 200 + same user id, got ${r.status} ${JSON.stringify(r.body)}`);
  else if (r.body?.reactivated !== true) fail(`login during grace period must report reactivated:true, got ${JSON.stringify(r.body)}`);
  else ok('logging back in during the grace period cancels the scheduled deletion');

  // Cleanup: actually delete the test account now (no need to leave it
  // scheduled/pending — the sweep would get it in 7 days regardless, but
  // there's no reason to leave test data lying around).
  r = await call('DELETE', '/api/profile/me', { password: newPassword });
  if (r.status !== 200) fail(`cleanup delete expected 200, got ${r.status} body=${JSON.stringify(r.body)}`);
  else ok('cleanup: test account scheduled for deletion again');
} catch (err) {
  fail(`unexpected exception: ${err?.stack || err}`);
}

if (failures > 0) {
  console.error(`\n${failures} smoke-account test(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll smoke-account tests passed');
}
