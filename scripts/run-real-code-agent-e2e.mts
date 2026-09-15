import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const base = 'http://127.0.0.1:5000';
const email = 'local-admin@mara.test';
const password = 'local-admin-e2e-password-2026';
const name = 'Local Control Admin';
const markerPath = 'server/services/code-agent-e2e-marker.ts';
const markerContent = "export const CODE_AGENT_E2E_MARKER = 'mara-code-agent-e2e';\n";
const reportPath = path.resolve('data/real-code-agent-e2e-report.json');
let cookie = '';

async function request(pathname: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set('x-forwarded-proto', 'https');
  if (cookie) headers.set('cookie', cookie);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${base}${pathname}`, { ...init, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${pathname} ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor<T>(label: string, fn: () => Promise<T | null>, predicate: (value: T) => boolean, timeoutMs = 180_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value && predicate(value)) return value;
    await sleep(3_000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function git(args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd: process.cwd(), shell: false, windowsHide: true, maxBuffer: 200_000 });
  return result.stdout;
}

async function sha(filePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  try { return createHash('sha256').update(await readFile(filePath)).digest('hex'); } catch { return createHash('sha256').update(Buffer.alloc(0)).digest('hex'); }
}

async function main() {
  try {
    try { await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); }
    catch { await request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }); }

    const beforeSha = await sha(markerPath);
    const requestBody = { description: `Create only ${markerPath} containing exactly one exported constant CODE_AGENT_E2E_MARKER with value mara-code-agent-e2e. Do not modify any other file. This is a harmless local lifecycle verification task.`, priority: 'medium' };
    const created = await request('/api/control/code-agent/requests', { method: 'POST', body: JSON.stringify(requestBody) });
    const requestId = created.request.id;
    const plan = await waitFor('Code Agent plan', async () => {
      const data = await request('/api/control/code-agent/plans');
      return data.plans.find((item: any) => item.requestId === requestId) ?? null;
    }, (item: any) => item.status === 'waiting_approval');
    const approvedPlan = await request(`/api/control/code-agent/plans/${plan.id}/approve`, { method: 'POST' });
    const modification = await waitFor('modification task', async () => {
      const data = await request('/api/control/tasks');
      return data.tasks.find((item: any) => item.taskType === 'repository.apply_changes' && item.payload.planId === plan.id) ?? null;
    }, (item: any) => item.status === 'WAITING_APPROVAL');
    await request(`/api/control/tasks/${modification.id}/approve`, { method: 'POST' });
    const modified = await waitFor('repository modification', async () => {
      const data = await request('/api/control/tasks');
      return data.tasks.find((item: any) => item.id === modification.id) ?? null;
    }, (item: any) => ['COMPLETED', 'FAILED'].includes(item.status));
    if (modified.status !== 'COMPLETED') throw new Error(`Modification failed: ${JSON.stringify(modified)}`);

    const validation = await waitFor('validation task', async () => {
      const data = await request('/api/control/tasks');
      return data.tasks.find((item: any) => item.taskType === 'project.typecheck' && item.payload.validationForTaskId === modification.id) ?? null;
    }, (item: any) => ['COMPLETED', 'FAILED'].includes(item.status));
    if (validation.status !== 'COMPLETED') throw new Error(`Validation failed: ${JSON.stringify(validation)}`);
    await request(`/api/control/tasks/${validation.id}/review`, { method: 'POST', body: JSON.stringify({ decision: 'approved' }) });

    const paths = (modified.payload.changes as any[]).map((item) => item.path);
    const stage = await request('/api/control/tasks', { method: 'POST', body: JSON.stringify({ taskType: 'git.stage_proposal', title: `Stage Code Agent proposal #${modification.id}`, payload: { paths, proposalTaskId: modification.id, validationTaskId: validation.id }, risk: 'HIGH_RISK', priority: 'high', assignedAgent: 'code-agent' }) });
    await request(`/api/control/tasks/${stage.task.id}/approve`, { method: 'POST' });
    const staged = await waitFor('staging task', async () => {
      const data = await request('/api/control/tasks');
      return data.tasks.find((item: any) => item.id === stage.task.id) ?? null;
    }, (item: any) => ['COMPLETED', 'FAILED'].includes(item.status));
    if (staged.status !== 'COMPLETED') throw new Error(`Staging failed: ${JSON.stringify(staged)}`);

    const diff = await git(['diff', '--cached', '--no-color', '--', markerPath]);
    const commit = await request('/api/control/tasks', { method: 'POST', body: JSON.stringify({ taskType: 'git.commit_staged', title: `Commit Code Agent proposal #${modification.id}`, payload: { message: 'chore: verify controlled code agent lifecycle', proposalTaskId: modification.id, validationTaskId: validation.id }, risk: 'HIGH_RISK', priority: 'high', assignedAgent: 'code-agent' }) });
    await request(`/api/control/tasks/${commit.task.id}/approve`, { method: 'POST' });
    const committed = await waitFor('commit task', async () => {
      const data = await request('/api/control/tasks');
      return data.tasks.find((item: any) => item.id === commit.task.id) ?? null;
    }, (item: any) => ['COMPLETED', 'FAILED'].includes(item.status));
    if (committed.status !== 'COMPLETED') throw new Error(`Commit failed: ${JSON.stringify(committed)}`);

    const afterSha = await sha(markerPath);
    const head = await git(['log', '-1', '--oneline']);
    const report = { status: 'PASS', requestId, planId: plan.id, modificationTaskId: modification.id, validationTaskId: validation.id, stagingTaskId: stage.task.id, commitTaskId: commit.task.id, file: markerPath, beforeSha, afterSha, diff, validationResult: validation.result, modificationResult: modified.result, stagingResult: staged.result, commitResult: committed.result, head: head.trim() };
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const report = { status: 'FAIL', error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) } };
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

await main();
