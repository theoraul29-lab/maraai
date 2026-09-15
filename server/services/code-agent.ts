import { rawSqlite } from '../db.js';
import { llmGenerate } from '../llm.js';
import { readRepositoryFile, readRepositoryStatus, readRepositorySearch } from './repository-status.js';
import { getControlTask, insertControlTask, type ControlTaskRow } from './control-task-engine.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { REPO_ROOT, resolveSafePath } from '../mara-brain/agents/code-explorer.js';
import path from 'node:path';

export interface CodeAgentRequestRow {
  id: number;
  description: string;
  priority: string;
  status: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  error: string | null;
}

export interface CodeAgentModuleContext {
  moduleId: string;
  moduleName: string;
  frontendFiles: string[];
  backendFiles: string[];
  databaseDependencies: string[];
  apiEndpoints: string[];
  sharedDependencies: string[];
  sharedWarnings: Array<{ file: string; sharedBy: string[] }>;
}

export interface CodeAgentPlanRow {
  id: number;
  requestId: number;
  analysis: Record<string, unknown>;
  changes: Array<Record<string, unknown>>;
  status: string;
  approvedBy: string | null;
  approvedAt: number | null;
  createdAt: number;
  updatedAt: number;
  error: string | null;
}

function parseJson(value: string, fallback: unknown): any {
  try { return JSON.parse(value); } catch { return fallback; }
}

function requestRow(row: Record<string, unknown>): CodeAgentRequestRow {
  return {
    id: Number(row.id), description: String(row.description), priority: String(row.priority), status: String(row.status),
    createdBy: (row.created_by as string | null) ?? null, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), error: (row.error as string | null) ?? null,
  };
}

function planRow(row: Record<string, unknown>): CodeAgentPlanRow {
  return {
    id: Number(row.id), requestId: Number(row.request_id), analysis: parseJson(String(row.analysis ?? '{}'), {}), changes: parseJson(String(row.changes ?? '[]'), []),
    status: String(row.status), approvedBy: (row.approved_by as string | null) ?? null, approvedAt: row.approved_at == null ? null : Number(row.approved_at),
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), error: (row.error as string | null) ?? null,
  };
}

async function sanitizePlanChanges(changes: unknown): Promise<Array<Record<string, unknown>>> {
  if (!Array.isArray(changes) || changes.length > 20) throw new Error('Planner produced an invalid number of changes');
  const safe: Array<Record<string, unknown>> = [];
  let totalBytes = 0;
  for (const change of changes) {
    if (!change || typeof change !== 'object') throw new Error('Planner produced an invalid change');
    const item = change as Record<string, unknown>;
    const filePath = typeof item.path === 'string' ? item.path : '';
    const content = typeof item.content === 'string' ? item.content : '';
    const safePath = resolveSafePath(filePath);
    const changeType = normalizeChangeType(item.type);
    if (!safePath || !changeType) throw new Error(`Planner proposed an unsafe path or operation: ${filePath}`);
    if (!content) throw new Error(`Planner proposed a change with no content: ${filePath}`);
    const normalized = safePath.relative.toLowerCase();
    if (normalized.startsWith('.git/') || normalized.startsWith('node_modules/') || normalized.startsWith('scripts/') || normalized.startsWith('.github/') || normalized.startsWith('migrations/') || normalized === '.env' || normalized.startsWith('.env.') || normalized.startsWith('dockerfile') || normalized.includes('sqlite') || normalized.endsWith('.db')) throw new Error(`Planner proposed protected path: ${safePath.relative}`);
    if (filePath.length > 500 || content.length > 200_000) throw new Error(`Planner proposed oversized change: ${filePath}`);
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (totalBytes > 200_000) throw new Error('Planner proposal exceeds total size limit');
    const existing = await readFile(path.join(REPO_ROOT, safePath.relative)).catch(() => Buffer.alloc(0));
    // Smaller local models occasionally "modify" a file by replacing its
    // entire body with a one-line stub instead of editing in place. A
    // real targeted edit rarely shrinks a non-trivial file by more than
    // half; catch that class of destructive rewrite here, at plan time,
    // rather than relying solely on the downstream typecheck/build gate.
    if (changeType === 'modify' && existing.length > 200 && content.length < existing.length * 0.5) {
      throw new Error(`Planner proposed a modify that deletes most of the file's content: ${safePath.relative} (${existing.length} -> ${content.length} bytes)`);
    }
    safe.push({ path: safePath.relative, type: changeType, reason: typeof item.reason === 'string' ? item.reason.slice(0, 1000) : '', content, expectedSha256: createHash('sha256').update(existing).digest('hex') });
  }
  return safe;
}

/** Small local models drift from the exact 'modify'/'create' enum; accept common synonyms rather than rejecting an otherwise-valid proposal. */
function normalizeChangeType(value: unknown): 'modify' | 'create' | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['modify', 'update', 'edit', 'change', 'patch'].includes(raw)) return 'modify';
  if (['create', 'new', 'add', 'add_file', 'new_file'].includes(raw)) return 'create';
  return null;
}

export function createCodeAgentRequest(description: string, priority: string, createdBy: string | null): CodeAgentRequestRow {
  const result = rawSqlite.prepare(`INSERT INTO mara_code_agent_requests (description, priority, created_by) VALUES (?, ?, ?)`).run(description.slice(0, 20_000), priority, createdBy);
  return getCodeAgentRequest(Number(result.lastInsertRowid))!;
}

export function createCodeAgentRequestWithTask(description: string, priority: string, createdBy: string | null, moduleContext?: CodeAgentModuleContext | null): { request: CodeAgentRequestRow; task: ControlTaskRow } {
  const scopedDescription = moduleContext
    ? `[Module: ${moduleContext.moduleName} (${moduleContext.moduleId})]\n${description.slice(0, 18_000)}\n\nModule context:\n${JSON.stringify(moduleContext).slice(0, 1_800)}`
    : description;
  const transaction = rawSqlite.transaction(() => {
    const result = rawSqlite.prepare(`INSERT INTO mara_code_agent_requests (description, priority, created_by) VALUES (?, ?, ?)`).run(scopedDescription.slice(0, 20_000), priority, createdBy);
    const requestId = Number(result.lastInsertRowid);
    const task = insertControlTask({ taskType: 'code-agent.plan', title: moduleContext ? `Plan ${moduleContext.moduleName} Code Agent request #${requestId}` : `Plan Code Agent request #${requestId}`, payload: { requestId, ...(moduleContext ? { moduleId: moduleContext.moduleId, moduleName: moduleContext.moduleName } : {}) }, risk: 'LOW_RISK', priority, createdBy, assignedAgent: 'code-agent' });
    return { request: getCodeAgentRequest(requestId)!, task };
  });
  return transaction() as { request: CodeAgentRequestRow; task: ControlTaskRow };
}

export function getCodeAgentRequest(id: number): CodeAgentRequestRow | null {
  const row = rawSqlite.prepare('SELECT * FROM mara_code_agent_requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? requestRow(row) : null;
}

export function getCodeAgentPlan(id: number): CodeAgentPlanRow | null {
  const row = rawSqlite.prepare('SELECT * FROM mara_code_agent_plans WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? planRow(row) : null;
}

export function listCodeAgentPlans(limit = 50): CodeAgentPlanRow[] {
  const rows = rawSqlite.prepare('SELECT * FROM mara_code_agent_plans ORDER BY updated_at DESC, id DESC LIMIT ?').all(Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>;
  return rows.map(planRow);
}

export async function planCodeAgentRequest(requestId: number): Promise<CodeAgentPlanRow> {
  const request = getCodeAgentRequest(requestId);
  if (!request) throw new Error('Code Agent request not found');
  rawSqlite.prepare("UPDATE mara_code_agent_requests SET status='planning', updated_at=unixepoch(), error=NULL WHERE id=?").run(requestId);
  try {
    const repository = readRepositoryStatus();
    const search = readRepositorySearch(request.description, 10);
    // The model cannot propose an accurate full-file rewrite for an existing
    // file it has never seen. Pull the current content of the most relevant
    // matches so a 'modify' change can actually reflect the real file.
    const previews = await Promise.all(
      search.slice(0, 3).map(async (entry) => {
        try {
          const file = await readRepositoryFile(entry.path, 4_000);
          return `--- ${entry.path} ---\n${file.content}`;
        } catch {
          return null;
        }
      }),
    );
    const fileContext = previews.filter((item): item is string => item !== null).join('\n\n');
    const prompt = `You are Mara's controlled Code Agent planner. Do not modify code. Analyze this request and return ONLY valid JSON (no markdown fences, no commentary) with keys analysis and changes.
Request: ${request.description}
Repository root: ${repository.root}
Indexed files: ${repository.indexedFiles}
Relevant indexed files: ${JSON.stringify(search)}
Current content of the most relevant files (use this as the basis for any 'modify' change — never guess at existing content):
${fileContext || '(no relevant file content found)'}

Respect any Module context in the request. Warn when a shared dependency affects more than one module.
Changes must be an array of objects, each with EXACTLY these keys: "path" (string, repo-relative), "type" (the literal string "modify" for an existing file or "create" for a new one — no other value is valid), "reason" (short string), "content" (the COMPLETE new file content as a string — not a diff, not a snippet; for "modify" this must be the full file with your change applied, keeping everything else byte-for-byte identical to what was shown above).
Never touch secrets, databases, migrations, .env, node_modules, scripts, .github, Dockerfiles, or deployment files. If you are not confident you know the full current content of a file, return an empty changes array instead of guessing.
Example shape (structure only, not real content): {"analysis":{"summary":"...","affectedModules":[],"dependencies":[],"risks":[],"validationPlan":[]},"changes":[{"path":"server/example.ts","type":"modify","reason":"...","content":"...full file..."}]}
Analysis must include summary, affectedModules, dependencies, risks, validationPlan.`;
    const raw = await llmGenerate(prompt, { source: 'agent.code-agent.plan', temperature: 0.1 });
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? parseJson(match[0], null) : null;
    const rawAnalysis = parsed?.analysis && typeof parsed.analysis === 'object' ? parsed.analysis as Record<string, unknown> : {};
    const analysis = {
      summary: typeof rawAnalysis.summary === 'string' ? rawAnalysis.summary.slice(0, 4_000) : raw.slice(0, 4_000),
      affectedModules: Array.isArray(rawAnalysis.affectedModules) ? rawAnalysis.affectedModules.filter((item): item is string => typeof item === 'string').slice(0, 50) : [],
      dependencies: Array.isArray(rawAnalysis.dependencies) ? rawAnalysis.dependencies.filter((item): item is string => typeof item === 'string').slice(0, 50) : [],
      risks: Array.isArray(rawAnalysis.risks) ? rawAnalysis.risks.filter((item): item is string => typeof item === 'string').slice(0, 50) : ['Planner output requires review'],
      validationPlan: Array.isArray(rawAnalysis.validationPlan) ? rawAnalysis.validationPlan.filter((item): item is string => typeof item === 'string').slice(0, 50) : [],
    };
    const changes = await sanitizePlanChanges(parsed?.changes ?? []);
    const result = rawSqlite.prepare(`INSERT INTO mara_code_agent_plans (request_id, analysis, changes, status) VALUES (?, ?, ?, 'waiting_approval')`).run(requestId, JSON.stringify(analysis), JSON.stringify(changes));
    rawSqlite.prepare("UPDATE mara_code_agent_requests SET status='planned', updated_at=unixepoch() WHERE id=?").run(requestId);
    return getCodeAgentPlan(Number(result.lastInsertRowid))!;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rawSqlite.prepare("UPDATE mara_code_agent_requests SET status='failed', error=?, updated_at=unixepoch() WHERE id=?").run(message.slice(0, 4000), requestId);
    throw error;
  }
}

export function approveCodeAgentPlan(planId: number, actor: string): { plan: CodeAgentPlanRow; task: ControlTaskRow } | null {
  const plan = getCodeAgentPlan(planId);
  if (!plan) return null;
  if (plan.status === 'approved_for_review') {
    const existing = rawSqlite.prepare(`SELECT * FROM mara_control_tasks WHERE task_type = 'repository.apply_changes' AND json_extract(payload, '$.planId') = ? ORDER BY id DESC LIMIT 1`).get(planId) as Record<string, unknown> | undefined;
    if (!existing) return null;
    return { plan, task: getControlTask(Number(existing.id))! };
  }
  if (plan.status !== 'waiting_approval') return null;
  const task = rawSqlite.transaction(() => {
    rawSqlite.prepare("UPDATE mara_code_agent_plans SET status='approved_for_review', approved_by=?, approved_at=unixepoch(), updated_at=unixepoch() WHERE id=?").run(actor, planId);
    return insertControlTask({
      taskType: 'repository.apply_changes',
      title: `Apply approved Code Agent plan #${planId}`,
      payload: { planId, summary: plan.analysis.summary ?? '', changes: plan.changes },
      risk: 'HIGH_RISK',
      priority: 'high',
      createdBy: actor,
      assignedAgent: 'code-agent',
    });
  })();
  return { plan: getCodeAgentPlan(planId)!, task };
}

export function rejectCodeAgentPlan(planId: number, actor: string): CodeAgentPlanRow | null {
  const plan = getCodeAgentPlan(planId);
  if (!plan || plan.status !== 'waiting_approval') return null;
  rawSqlite.prepare("UPDATE mara_code_agent_plans SET status='rejected', approved_by=?, approved_at=unixepoch(), updated_at=unixepoch() WHERE id=?").run(actor, planId);
  return getCodeAgentPlan(planId);
}
