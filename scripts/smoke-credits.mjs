/**
 * Smoke tests for the Mara Credits ledger. Spawns no server — exercises
 * server/maraai/credits.ts directly against the live SQLite file via tsx.
 * Awards are isolated to a synthetic test user id whose rows are cleaned
 * up before and after the run.
 *
 * Usage: node scripts/smoke-credits.mjs
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Probe file lives inside the repo so its relative imports resolve. We
// stash it under scripts/ with a unique name, then unlink it at the end.
const probeFile = path.join(__dirname, `.smoke-credits-${Date.now()}.ts`);

const probeSource = `
import { awardCredits, awardActivationBonus, getBalance, getHistory, CREDIT_REASONS, CREDIT_AMOUNTS } from '../server/maraai/credits.js';
import { db } from '../server/db.js';
import { creditTransactions, userCredits } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

const TEST_USER = '__smoke_test_user__';
const fail = (msg: string): never => { console.error('FAIL ' + msg); process.exit(1); throw new Error(msg); };
const ok = (msg: string) => console.log('OK   ' + msg);

async function main() {
  await db.delete(creditTransactions).where(eq(creditTransactions.userId, TEST_USER));
  await db.delete(userCredits).where(eq(userCredits.userId, TEST_USER));

  const initial = await getBalance(TEST_USER);
  if (initial.balance !== 0) fail('initial balance should be 0, got ' + initial.balance);
  ok('initial balance is 0');

  const after1 = (await awardActivationBonus(TEST_USER, 'desktop'))!;
  if (after1.balance !== CREDIT_AMOUNTS.signupBonusDesktop) fail('desktop bonus should be ' + CREDIT_AMOUNTS.signupBonusDesktop + ', got ' + after1.balance);
  ok('desktop signup bonus credited (' + after1.balance + ')');

  const after2 = (await awardActivationBonus(TEST_USER, 'desktop'))!;
  if (after2.balance !== after1.balance) fail('repeated desktop bonus must NOT double-pay; balance was ' + after2.balance);
  ok('desktop signup bonus idempotent');

  await awardCredits({ userId: TEST_USER, delta: CREDIT_AMOUNTS.p2pComputeJob, reason: CREDIT_REASONS.P2P_COMPUTE_JOB, idempotencyKey: 'job_aaa' });
  const after3 = await awardCredits({ userId: TEST_USER, delta: CREDIT_AMOUNTS.p2pComputeJob, reason: CREDIT_REASONS.P2P_COMPUTE_JOB, idempotencyKey: 'job_bbb' });
  const expected = CREDIT_AMOUNTS.signupBonusDesktop + 2 * CREDIT_AMOUNTS.p2pComputeJob;
  if (after3.balance !== expected) fail('two compute jobs should yield ' + expected + ', got ' + after3.balance);
  ok('two compute jobs credited correctly');

  const after4 = await awardCredits({ userId: TEST_USER, delta: CREDIT_AMOUNTS.p2pComputeJob, reason: CREDIT_REASONS.P2P_COMPUTE_JOB, idempotencyKey: 'job_aaa' });
  if (after4.balance !== after3.balance) fail('replay of job_aaa should not change balance');
  ok('compute job replay is idempotent');

  const after5 = await awardCredits({ userId: TEST_USER, delta: -10, reason: CREDIT_REASONS.SPEND_PREMIUM });
  if (after5.balance !== after4.balance - 10) fail('spend should decrement balance, got ' + after5.balance);
  if (after5.lifetimeSpent !== 10) fail('lifetimeSpent should be 10, got ' + after5.lifetimeSpent);
  ok('spend tracks balance + lifetimeSpent');

  const history = await getHistory(TEST_USER, 50);
  if (history.length < 4) fail('history should have at least 4 entries, got ' + history.length);
  ok('history has ' + history.length + ' entries');

  await db.delete(creditTransactions).where(eq(creditTransactions.userId, TEST_USER));
  await db.delete(userCredits).where(eq(userCredits.userId, TEST_USER));

  console.log('\\nAll credits smoke tests passed');
  process.exit(0);
}

main().catch((err) => {
  console.error('UNEXPECTED', err);
  process.exit(1);
});
`;

writeFileSync(probeFile, probeSource);

try {
  const result = spawnSync('npx', ['tsx', probeFile], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  process.exit(result.status ?? 1);
} finally {
  try {
    unlinkSync(probeFile);
  } catch {
    /* ignore */
  }
}
