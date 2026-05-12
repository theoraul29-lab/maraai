// Smoke test for the Growth Engineer agent. Boots a fresh test database by
// running `tsx server/index.ts` once (so migrations + auto-heal apply), kills
// it, then exercises the agent functions against that DB.
//
// Covered:
//   readFunnelData()       — counts a hand-seeded funnel
//   identifyDropOffPoint() — picks the worst stage
//   proposeGrowthExperiment() with no LLM     → returns null (no crash)
//   listExperiments() / decideExperiment() / markImplemented()
//   measureExperimentOutcome() with a short window
//   runGrowthEngineerCycle() end-to-end smoke (no LLM)
//
// The LLM path (real Ollama / Anthropic call) is intentionally NOT covered
// here; that requires network + a working tunnel, and is exercised in prod.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'growth-test-'));
const dbPath = path.join(dir, 'test.sqlite');
const script = path.join(dir, 'run.mjs');

// Boot the server once to apply migrations against our fresh DB, then kill
// it. We watch its stdout for the "serving on port" line so we don't sleep
// arbitrarily.
async function bootForMigrations() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'server/index.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
        NODE_ENV: 'development',
        AUTH_MODE: 'local',
        SESSION_SECRET: 'test',
        PORT: '3055',
        BRAIN_ENABLED: 'false',
        PROCESS_AI_TASKS: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (buf) => {
      out += buf.toString();
      if (out.includes('serving on port')) {
        child.kill('SIGTERM');
        setTimeout(() => resolve(), 250);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Server boot timeout. Output so far:\n' + out));
    }, 45_000);
    child.on('exit', () => clearTimeout(t));
  });
}

console.log('[test] booting server to apply migrations against', dbPath);
await bootForMigrations();
console.log('[test] migrations applied, running agent assertions');

writeFileSync(
  script,
  `
process.env.DATABASE_PATH = ${JSON.stringify(dbPath)};
process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'local';
delete process.env.OLLAMA_BASE_URL;
delete process.env.ANTHROPIC_API_KEY;

const { db } = await import(${JSON.stringify(path.resolve('server/db.ts'))});
const schema = await import(${JSON.stringify(path.resolve('shared/schema.ts'))});
const auth = await import(${JSON.stringify(path.resolve('shared/models/auth.ts'))});
const ge = await import(${JSON.stringify(path.resolve('server/mara-brain/agents/growth-engineer.ts'))});

const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
const ok = (msg) => console.log('OK:', msg);

const now = Math.floor(Date.now() / 1000) * 1000;
const day = 24 * 60 * 60 * 1000;
const ago = (d) => new Date(now - d * day);

const signups = 10;
const activated = 6;
const engaged = 3;
const converted = 1;
const ids = [];
for (let i = 0; i < signups; i++) {
  const id = 'user-' + i;
  ids.push(id);
  await db.insert(auth.users).values({
    id,
    email: 'u' + i + '@test.com',
    tier: i < converted ? 'premium' : 'free',
    createdAt: ago(5),
  });
}
for (let i = 0; i < activated; i++) {
  await db.insert(schema.chatMessages).values({
    content: 'hello', sender: 'user', userId: ids[i], createdAt: ago(5),
  });
}
for (let i = 0; i < engaged; i++) {
  await db.insert(schema.chatMessages).values({
    content: 'returning', sender: 'user', userId: ids[i], createdAt: ago(3),
  });
}

const funnel = await ge.readFunnelData(14);
const c = (s) => funnel.stages.find((x) => x.stage === s).count;
if (funnel.totalSignups !== signups) fail('totalSignups=' + funnel.totalSignups);
if (c('activation') !== activated) fail('activation=' + c('activation'));
if (c('engagement') !== engaged) fail('engagement=' + c('engagement'));
if (c('conversion') !== converted) fail('conversion=' + c('conversion'));
ok('readFunnelData counts the funnel correctly');

// Funnel drop-offs (signups=10, activated=6, engaged=3, converted=1):
//   signup→activation     = 4/10 = 0.40
//   activation→engagement = 3/6  = 0.50
//   engagement→conversion = 2/3  = 0.667
//   conversion→retention  = 0/1  = 0.00 (user-0's last event was 3d ago, inside the 7d window)
//
// Under the default ObjectiveFunction (primary='growth') we now bias by
// objective weight: top-of-funnel stages get a 1.0 bonus when primary='growth',
// so 'activation' (rate 0.4 * (0.5+1.0)=0.6) beats 'conversion' (0.667 * (0.5+0.1)=0.4).
const dropOff = ge.identifyDropOffPoint(funnel);
if (!dropOff) fail('no drop-off identified');
if (dropOff.stage !== 'activation') {
  fail('under primary=growth expected activation, got ' + dropOff.stage + ' (dropOffRate=' + dropOff.dropOffRate + ')');
}
ok('identifyDropOffPoint picks activation under primary=growth');

// Flip the objective to primary='revenue' with a heavy revenue weight; the
// picker should now favour the 'conversion' stage even though its raw drop-off
// rate is unchanged. This proves the ObjectiveFunction → stage-selection wire
// is hot end-to-end.
const objective = await import(${JSON.stringify(path.resolve('server/mara-core/objective.ts'))});
const objTypes = await import(${JSON.stringify(path.resolve('server/mara-core/types.ts'))});
objective.setObjective({
  primary: 'revenue',
  weights: { ...objTypes.DEFAULT_OBJECTIVE.weights, revenue: 0.9, retention: 0.05, engagement: 0.05 },
}, 'test-script');
const dropOff2 = ge.identifyDropOffPoint(funnel);
if (!dropOff2 || dropOff2.stage !== 'conversion') {
  fail('after objective flip to revenue expected conversion, got ' + (dropOff2 && dropOff2.stage));
}
ok('identifyDropOffPoint flips to conversion when objective.primary=revenue');

// Reset back to growth so the remaining tests run with predictable defaults.
objective.setObjective({
  primary: 'growth',
  weights: objTypes.DEFAULT_OBJECTIVE.weights,
}, 'test-script');

const noLLM = await ge.proposeGrowthExperiment(funnel, dropOff);
if (noLLM !== null) fail('expected null without LLM');
ok('proposeGrowthExperiment returns null without LLM (no crash)');

const empty = await ge.measureExperimentOutcome();
if (!Array.isArray(empty) || empty.length !== 0) fail('expected [] from measure with empty queue');
ok('measureExperimentOutcome handles empty queue');

const inserted = await db
  .insert(schema.maraGrowthExperiments)
  .values({
    dropOffStage: 'engagement',
    baselineDropOffRate: 0.5,
    baselineMetrics: JSON.stringify(funnel),
    hypothesis: 'Adding a hook reduces engagement drop-off',
    framework: 'hook',
    codeSketch: 'Add onboarding hook on first visit',
    iceImpact: 8,
    iceConfidence: 6,
    iceEase: 7,
    iceScore: (8 * 6 * 7) / 10,
    expectedImpactPct: 0.2,
    citedKnowledgeIds: '[]',
    status: 'proposed',
  })
  .returning({ id: schema.maraGrowthExperiments.id });
const expId = inserted[0].id;
ok('inserted proposed experiment id=' + expId);

const listed = await ge.listExperiments({ status: 'proposed' });
if (!listed.find((e) => e.id === expId)) fail('listExperiments missing the row');
ok('listExperiments({status:proposed}) returns our row');

const approved = await ge.decideExperiment(expId, 'approved', 'admin@test.com', 'looks good');
if (approved.status !== 'approved') fail('decide approve failed (status=' + approved.status + ')');
if (approved.decidedBy !== 'admin@test.com') fail('decidedBy not set');
ok('decideExperiment approved');

const impl = await ge.markImplemented(expId, 50);
if (impl.status !== 'implemented') fail('mark implemented failed (status=' + impl.status + ')');
if (!impl.implementedAt) fail('implementedAt not set');
ok('markImplemented set implementedAt + measureAfterAt');

await new Promise((r) => setTimeout(r, 250));
const measured = await ge.measureExperimentOutcome();
const ours = measured.find((x) => x.experimentId === expId);
if (!ours) fail('our experiment was not measured (queue=' + JSON.stringify(measured) + ')');
if (ours.status !== 'measured') fail('expected status measured, got ' + ours.status);
ok('measureExperimentOutcome wrote actual impact + learning');

const allKb = await db.select().from(schema.maraKnowledgeBase);
const learning = allKb.find((k) => k.topic.toLowerCase().includes('experiment #' + expId));
if (!learning) fail('learning not stored in mara_knowledge_base (' + allKb.length + ' rows)');
ok('learning stored: ' + learning.topic);

const cycle = await ge.runGrowthEngineerCycle();
if (!cycle.funnel) fail('cycle.funnel missing');
ok('runGrowthEngineerCycle returned a snapshot without crashing');

console.log('\\nALL GROWTH ENGINEER TESTS PASSED');
process.exit(0);
`,
);

const result = spawnSync('npx', ['tsx', script], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, DATABASE_PATH: dbPath },
});
process.exit(result.status ?? 1);
