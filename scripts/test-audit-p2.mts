// Smoke test for Audit P2: cross-process advisory lock + knowledge
// conflict detector.
//
// Run as: npx tsx scripts/test-audit-p2.mts
//
// What this exercises (LLM-free, no network):
//   1. SingletonLock acquire/release/contention/expiry/heartbeat
//   2. detectPolarityConflict heuristic
//   3. End-to-end: storeKnowledge inserts two contradictory rows in the
//      same category, then listUnresolvedConflicts returns the pair.
//
// Side effects: writes to a fresh /tmp DB, then deletes it.

import { unlinkSync } from 'node:fs';

const DB = '/tmp/maracore-audit-p2-test.sqlite';
try { unlinkSync(DB); } catch {}
process.env.DATABASE_PATH = DB;

// Ensure migrations + auto-create DDL run via the server's db module.
await import('../server/db.ts');

const { SingletonLock, listSingletonLocks } = await import('../server/lib/singleton-lock.ts');
const { detectPolarityConflict, listUnresolvedConflicts, resolveConflict } = await import(
  '../server/mara-brain/conflict-detector.ts'
);
const { storeKnowledge } = await import('../server/mara-brain/knowledge-base.ts');

function ok(msg: string) { console.log('OK:', msg); }
function fail(msg: string): never { console.error('FAIL:', msg); process.exit(1); }

// -----------------------------------------------------------------------------
// 1. SingletonLock
// -----------------------------------------------------------------------------

console.log('\n--- SingletonLock ---');

const lockA = new SingletonLock('test_lock', { ttlMs: 5000, holder: 'instance-A' });
if (!lockA.acquire()) fail('A should acquire fresh lock');
ok('instance-A acquired fresh lock');

const lockB = new SingletonLock('test_lock', { ttlMs: 5000, holder: 'instance-B' });
if (lockB.acquire()) fail('B should NOT acquire while A holds it');
ok('instance-B blocked from holding lock at the same time');

if (!lockA.heartbeat()) fail('A heartbeat should succeed');
ok('instance-A heartbeat extends lease');

const all = listSingletonLocks();
if (all.length !== 1 || all[0].holder !== 'instance-A') {
  fail(`listSingletonLocks expected [instance-A] got ${JSON.stringify(all)}`);
}
ok('listSingletonLocks reports the holder');

// Force-expire the lease by writing a past expires_at directly.
const { rawSqlite } = await import('../server/db.ts');
rawSqlite
  .prepare('UPDATE mara_singleton_locks SET expires_at = ? WHERE name = ?')
  .run(Date.now() - 60_000, 'test_lock');

const lockC = new SingletonLock('test_lock', { ttlMs: 5000, holder: 'instance-C' });
if (!lockC.acquire()) fail('C should steal expired lock');
ok('instance-C stole expired lock');

// A's heartbeat should now fail (we got evicted).
if (lockA.heartbeat()) fail('A heartbeat should fail after eviction');
ok('instance-A heartbeat fails after eviction');

lockC.release();
const afterRelease = listSingletonLocks();
if (afterRelease.length !== 0) fail('release should remove the row');
ok('release clears the lock row');

// -----------------------------------------------------------------------------
// 2. detectPolarityConflict
// -----------------------------------------------------------------------------

console.log('\n--- detectPolarityConflict ---');

const c1 = detectPolarityConflict(
  'crypto trading is risky and you should be careful',
  'crypto trading is safe for retirement portfolios',
);
if (!c1 || !c1.reason.startsWith('polarity:safe')) fail(`expected safe/risky polarity, got ${JSON.stringify(c1)}`);
ok(`safe/risky detected (${c1.reason})`);

const c2 = detectPolarityConflict(
  'this is the best framework',
  'this is the worst framework I have ever used',
);
if (!c2) fail('expected best/worst polarity');
ok(`best/worst detected (${c2.reason})`);

const c3 = detectPolarityConflict(
  'cars are red',
  'cars are blue',
);
if (c3) fail('non-polarity colour difference should NOT trigger conflict');
ok('non-polarity content does not falsely flag');

const c4 = detectPolarityConflict(
  'the warehouse has a saferoom',
  'this product is risky',
);
if (c4 && c4.reason.startsWith('polarity:safe-vs-risky')) {
  fail('safe vs risky must use word boundaries; "saferoom" should not match');
}
ok('word-boundary check rejects "saferoom" as a "safe" match');

// -----------------------------------------------------------------------------
// 3. End-to-end: storeKnowledge + flagConflictsForKnowledge
// -----------------------------------------------------------------------------

console.log('\n--- storeKnowledge -> conflict flag ---');

const idA = await storeKnowledge(
  'business_insight',
  'crypto trading',
  'Crypto trading is risky for retail investors due to volatility.',
  'llm',
  80,
);
const idB = await storeKnowledge(
  'business_insight',
  'crypto trading',
  'Crypto trading is safe for retirement portfolios according to several studies.',
  'llm',
  80,
);
if (idA === idB) fail('expected two distinct rows for contradictory facts');
ok(`storeKnowledge inserted two distinct rows (#${idA}, #${idB})`);

const conflicts = listUnresolvedConflicts();
const match = conflicts.find(
  (c) =>
    (c.knowledge_a_id === Math.min(idA, idB) && c.knowledge_b_id === Math.max(idA, idB)),
);
if (!match) fail(`expected a conflict row for #${idA} <-> #${idB}, got ${JSON.stringify(conflicts)}`);
if (!match.reason.startsWith('polarity:')) fail(`expected polarity reason, got ${match.reason}`);
if (match.category !== 'business_insight') fail(`expected category business_insight, got ${match.category}`);
ok(`conflict row created (id=${match.id}, reason=${match.reason})`);

// resolve drops it from the unresolved list.
if (!resolveConflict(match.id, 'admin@test.com')) fail('resolveConflict should return true');
if (resolveConflict(match.id, 'admin@test.com')) fail('resolveConflict should be idempotent (second call false)');
const afterResolve = listUnresolvedConflicts();
if (afterResolve.find((c) => c.id === match.id)) fail('resolved conflict should drop off list');
ok('resolveConflict marks the row resolved');

// Storing a third row with no polarity words should NOT create any new
// conflict — the detector is heuristic on a small word list, so a fact
// that doesn't mention any polarity word can't trigger a flag.
const idC = await storeKnowledge(
  'business_insight',
  'crypto trading',
  'Crypto trading volume in Q1 was 30% higher than Q4 last year.',
  'llm',
  80,
);
if (idC === idA || idC === idB) {
  // If similarity > 0.8 this might bump existing — that's fine, just skip.
} else {
  const afterAgree = listUnresolvedConflicts();
  if (afterAgree.some((c) => c.knowledge_a_id === idC || c.knowledge_b_id === idC)) {
    fail('polarity-neutral row should not be flagged as a conflict');
  }
  ok('polarity-neutral content does not create a conflict');
}

// Also: storing TWO "risky" rows should NOT conflict with each other (same polarity).
const idD = await storeKnowledge(
  'business_insight',
  'options trading',
  'Options trading is risky for novice retail investors.',
  'llm',
  80,
);
const idE = await storeKnowledge(
  'business_insight',
  'options trading',
  'Options trading is risky because of leverage and time decay.',
  'llm',
  80,
);
if (idD !== idE) {
  const sameDirection = listUnresolvedConflicts().some(
    (c) =>
      (c.knowledge_a_id === idD && c.knowledge_b_id === idE) ||
      (c.knowledge_a_id === idE && c.knowledge_b_id === idD),
  );
  if (sameDirection) fail('two same-polarity rows should not conflict with each other');
  ok('two same-polarity rows do not conflict with each other');
}

try { unlinkSync(DB); } catch {}
console.log('\nALL AUDIT P2 TESTS PASSED');
