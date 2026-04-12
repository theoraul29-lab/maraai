/**
 * Smoke tests for CI — verifies critical endpoints are reachable.
 * Usage: MARAAI_BASE_URL=http://localhost:3001 node scripts/smoke-runtime.mjs
 */

const BASE = process.env.MARAAI_BASE_URL || 'http://localhost:3001';

const endpoints = [
  { path: '/api/health', expect: 200 },
  { path: '/api/runtime', expect: 200 },
  // AI provider health — always returns JSON; 503 means "not configured" (expected in CI)
  { path: '/api/ai/health', expect: [200, 503] },
];

let failures = 0;

for (const { path, expect } of endpoints) {
  const url = `${BASE}${path}`;
  const acceptedStatuses = Array.isArray(expect) ? expect : [expect];
  try {
    const res = await fetch(url);
    if (!acceptedStatuses.includes(res.status)) {
      console.error(`FAIL  ${url} — expected ${acceptedStatuses.join('|')}, got ${res.status}`);
      failures++;
    } else {
      const body = await res.text();
      console.log(`OK    ${url} (${res.status}) ${body.slice(0, 120)}`);
    }
  } catch (err) {
    console.error(`FAIL  ${url} — ${err.message}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} smoke test(s) failed`);
  process.exit(1);
} else {
  console.log(`\nAll ${endpoints.length} smoke tests passed`);
}
