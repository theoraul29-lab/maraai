/**
 * Smoke test for the billing/programs endpoints added this session
 * (server/billing/programs.ts's expandWithPrerequisites cascade rule,
 * server/billing/programs-api.ts, server/billing/api.ts). Deliberately
 * scoped to what's safe to exercise from an automated script that runs on
 * every push: PAYMENTS_ENABLED is true in production with a LIVE PayPal
 * configuration, so a real purchase request for an item a fresh test user
 * doesn't already own would attempt to create a REAL PayPal order. This
 * test never sends a request that reaches that code path — it only checks
 * auth gating, input validation, and the read-only catalogue, all of which
 * exercise real logic (including the cascade-expansion function, for the
 * unknown-item case) without spending anything or touching PayPal.
 *
 * Usage: MARAAI_BASE_URL=http://localhost:3001 node scripts/smoke-billing.mjs
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

const PAID_PROGRAM_IDS = ['new_skills', 'new_body', 'new_life', 'new_you'];
const email = `smoke-billing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = 'SmokeBillingPass!42';
const name = 'Smoke Billing User';

try {
  // 1. Catalogue is read-only and needs no auth — safe to hit as-is. Checks
  //    the cascade-aware pricing set this session (€7 -> €8 per program).
  let r = await call('GET', '/api/billing/programs');
  if (r.status !== 200 || !Array.isArray(r.body?.programs)) {
    fail(`GET /api/billing/programs expected 200 + programs array, got ${r.status} ${JSON.stringify(r.body)}`);
  } else {
    const bad = PAID_PROGRAM_IDS
      .map((id) => r.body.programs.find((p) => p.id === id))
      .filter((p) => !p || p.priceCents !== 800);
    if (bad.length > 0) fail(`expected all 4 paid programs at 800 cents, mismatches: ${JSON.stringify(bad)}`);
    else ok('all 4 sequenced programs (new_skills/body/life/you) priced at 800 cents');
    if (typeof r.body.paymentsEnabled !== 'boolean') fail(`paymentsEnabled should be a boolean, got ${JSON.stringify(r.body.paymentsEnabled)}`);
    else ok(`paymentsEnabled reported as ${r.body.paymentsEnabled}`);
  }

  // 2. Purchase endpoint requires a real (non-anonymous) account — every
  //    visitor gets an anonymous session automatically, so this checks that
  //    an anonymous cookie jar (never logged in) is rejected.
  r = await call('POST', '/api/billing/program/purchase', { item: 'new_skills' });
  if (r.status !== 401) fail(`purchase while anonymous expected 401, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('program purchase rejects anonymous/unauthenticated session (401)');

  // 3. Subscribe endpoint has the same requirement. Anonymous requests never
  //    reach the handler's own auth check — routes.ts's global
  //    requireAccountGate rejects them first (all mutating /api/billing/*
  //    calls require a registered account), so the body is that gate's
  //    shape, not billing/api.ts's internal `not_authenticated` shape.
  r = await call('POST', '/api/billing/subscribe', { planId: 'vip_monthly', provider: 'paypal' });
  if (r.status !== 401) fail(`subscribe while anonymous expected 401, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('VIP subscribe rejects anonymous/unauthenticated session (401)');

  // 4. Now sign up a real (disposable) test account for the authenticated
  //    checks below — none of these reach PayPal/Stripe.
  r = await call('POST', '/api/auth/signup', { email, password, name });
  if (r.status !== 201 || !r.body?.id) fail(`signup expected 201 with id, got ${r.status} body=${JSON.stringify(r.body)}`);
  else ok(`signup OK for billing test account (id=${r.body.id.slice(0, 8)}…)`);

  // 5. An unknown program id must 404 before any payment attempt. This
  //    still exercises expandWithPrerequisites for real (an id it doesn't
  //    recognize passes through unexpanded, then fails resolution) —
  //    without ever reaching a real item worth charging for.
  r = await call('POST', '/api/billing/program/purchase', { item: 'not-a-real-program-id' });
  if (r.status !== 404 || r.body?.error !== 'unknown_item')
    fail(`purchase of unknown item expected 404/unknown_item, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('purchase of an unknown program id 404s before reaching payment (unknown_item)');

  // 6. More than 4 items in one request must fail validation (Zod
  //    .max(4)) — rejected before the handler even resolves items.
  r = await call('POST', '/api/billing/program/purchase', {
    items: ['new_skills', 'new_body', 'new_life', 'new_you', 'bundle_all_programs'],
  });
  if (r.status !== 400 || r.body?.error !== 'invalid_body')
    fail(`purchase with 5 items expected 400/invalid_body, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('purchase request with more than 4 items is rejected by validation (400)');

  // 7. Subscribing to an unknown plan id must 404 before reaching Stripe/
  //    PayPal, same shape as the program-purchase unknown-item check.
  r = await call('POST', '/api/billing/subscribe', { planId: 'not_a_real_plan', provider: 'paypal' });
  if (r.status !== 404 || r.body?.error !== 'unknown_plan')
    fail(`subscribe to unknown plan expected 404/unknown_plan, got ${r.status} ${JSON.stringify(r.body)}`);
  else ok('subscribing to an unknown plan id 404s before reaching a payment provider');

  // Cleanup: remove the disposable test account (schedules deletion, same
  // as smoke-account.mjs — no real money was ever touched by this script).
  r = await call('DELETE', '/api/profile/me', { password });
  if (r.status !== 200) fail(`cleanup delete expected 200, got ${r.status} body=${JSON.stringify(r.body)}`);
  else ok('cleanup: test account scheduled for deletion');
} catch (err) {
  fail(`unexpected exception: ${err?.stack || err}`);
}

if (failures > 0) {
  console.error(`\n${failures} smoke-billing test(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll smoke-billing tests passed');
}
