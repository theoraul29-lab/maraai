import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);
dotenv.config();

function resolveArtifactRoot(): string {
  const envRoot = process.env.MARAAI_ARTIFACT_ROOT;
  if (envRoot && envRoot.trim()) return envRoot.trim();
  const base = process.env.LOCALAPPDATA ?? process.env.TEMP ?? os.tmpdir();
  return path.join(base, 'maraai', 'artifacts');
}

const artifactRoot = resolveArtifactRoot();
const reportPath = path.join(artifactRoot, 'control-task-e2e-report.json');
const startPath = path.join(artifactRoot, 'control-task-e2e-start.txt');
const endPath = path.join(artifactRoot, 'control-task-e2e-end.txt');
const exitPath = path.join(artifactRoot, 'control-task-e2e-exit-code.txt');

const startedAt = new Date().toISOString();
await mkdir(artifactRoot, { recursive: true });
await writeFile(startPath, `${startedAt}\n`, 'utf8');

try {
  if (process.env.BRAIN_DRY_RUN === 'true') throw new Error('Refusing to run control task while BRAIN_DRY_RUN=true');
  if (process.env.CONTROL_TASK_WORKER_ENABLED === 'true') throw new Error('Refusing one-shot runner while persistent worker is enabled');

  const { createControlTask, listControlTaskEvents } = await import('../server/services/control-task-engine.js');
  const { runOneControlTask } = await import('../server/bootstrap/control-task-worker.js');

  const task = createControlTask({
    taskType: 'repository.overview',
    title: 'E2E local repository overview',
    risk: 'READ_ONLY',
    priority: 'low',
    createdBy: 'local-e2e',
  });
  const completed = await runOneControlTask(task.id);
  assert.equal(completed?.status, 'COMPLETED');
  assert.equal(completed?.taskType, 'repository.overview');
  assert.ok(completed?.result);
  const events = listControlTaskEvents(task.id);
  assert.ok(events.some((event) => event.event_type === 'created'));
  assert.ok(events.some((event) => event.event_type === 'started'));
  assert.ok(events.some((event) => event.event_type === 'completed'));

  const report = {
    kind: 'control-task-e2e',
    status: 'PASS',
    startedAt,
    endedAt: new Date().toISOString(),
    taskId: task.id,
    taskType: completed?.taskType,
    finalStatus: completed?.status,
    attempts: completed?.attempts,
    result: completed?.result ?? null,
    resultKeys: Object.keys((completed?.result ?? {}) as Record<string, unknown>),
    eventTypes: events.map((event) => event.event_type),
    artifacts: { reportPath, startPath, endPath, exitPath },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(endPath, `${new Date().toISOString()}\n`, 'utf8');
  await writeFile(exitPath, '0\n', 'utf8');
} catch (error) {
  const report = {
    kind: 'control-task-e2e',
    status: 'FAIL',
    startedAt,
    endedAt: new Date().toISOString(),
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) },
    artifacts: { reportPath, startPath, endPath, exitPath },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(endPath, `${new Date().toISOString()}\n`, 'utf8');
  await writeFile(exitPath, '1\n', 'utf8');
  process.exitCode = 1;
}
