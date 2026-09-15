import { rawSqlite } from '../db.js';
import { permissionForRisk } from './permission-policy.js';
import { requiredRiskForTool } from './tool-policy.js';
import { transitionTask } from './task-lifecycle.js';
import type { UnifiedTaskStatus } from './task-engine.js';
import type { TaskRisk } from './task-policy.js';

export interface ControlTaskInput {
  taskType: string;
  title: string;
  payload?: Record<string, unknown>;
  risk?: TaskRisk;
  priority?: string;
  createdBy?: string | null;
  assignedAgent?: string | null;
}

export interface ControlTaskRow {
  id: number;
  taskType: string;
  title: string;
  payload: Record<string, unknown>;
  status: UnifiedTaskStatus;
  risk: TaskRisk;
  priority: string;
  createdBy: string | null;
  assignedAgent: string | null;
  workerId: string | null;
  result: unknown;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  approvedBy: string | null;
  approvedAt: number | null;
  updatedAt: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number | null;
  reviewDecision: 'approved' | 'rejected' | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
}

function rowToTask(row: Record<string, unknown>): ControlTaskRow {
  return {
    id: Number(row.id),
    taskType: String(row.task_type),
    title: String(row.title),
    payload: (parseJson(String(row.payload ?? '{}')) ?? {}) as Record<string, unknown>,
    status: String(row.status) as UnifiedTaskStatus,
    risk: String(row.risk) as TaskRisk,
    priority: String(row.priority),
    createdBy: (row.created_by as string | null) ?? null,
    assignedAgent: (row.assigned_agent as string | null) ?? null,
    workerId: (row.worker_id as string | null) ?? null,
    result: parseJson(row.result as string | null),
    error: (row.error as string | null) ?? null,
    createdAt: Number(row.created_at),
    startedAt: row.started_at == null ? null : Number(row.started_at),
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: row.approved_at == null ? null : Number(row.approved_at),
    updatedAt: Number(row.updated_at),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    nextAttemptAt: row.next_attempt_at == null ? null : Number(row.next_attempt_at),
    reviewDecision: row.review_decision === 'approved' || row.review_decision === 'rejected' ? row.review_decision : null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: row.reviewed_at == null ? null : Number(row.reviewed_at),
  };
}

function recordEvent(taskId: number, eventType: string, fromStatus: string | null, toStatus: string | null, actor: string | null, metadata: Record<string, unknown> = {}): void {
  rawSqlite.prepare(`
    INSERT INTO mara_control_task_events (task_id, event_type, from_status, to_status, actor, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(taskId, eventType, fromStatus, toStatus, actor, JSON.stringify(metadata));
}

export function recordControlTaskEvent(taskId: number, eventType: string, metadata: Record<string, unknown> = {}): void {
  recordEvent(taskId, eventType, null, null, 'worker', metadata);
}

export function recordControlAdminAction(actionType: string, targetId: number, actor: string | null, metadata: Record<string, unknown> = {}, targetType = 'control_task'): void {
  rawSqlite.prepare(`
    INSERT INTO mara_admin_actions (action_type, target_type, target_id, actor, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(actionType, targetType, String(targetId), actor, JSON.stringify(metadata));
}

export function createControlTask(input: ControlTaskInput): ControlTaskRow {
  const canonicalRisk = requiredRiskForTool(input.taskType);
  if (!canonicalRisk && input.taskType.startsWith('git.')) {
    throw new Error(`Unknown Git task type: ${input.taskType}`);
  }
  const risk = canonicalRisk ?? input.risk ?? 'READ_ONLY';
  if (canonicalRisk && input.risk && input.risk !== canonicalRisk) {
    throw new Error(`Task ${input.taskType} must use risk ${canonicalRisk}.`);
  }
  const permission = permissionForRisk(risk);
  const initialStatus: UnifiedTaskStatus = permission.approvalRequired ? 'WAITING_APPROVAL' : 'QUEUED';
  return insertControlTask(input, initialStatus);
}

export function insertControlTask(input: ControlTaskInput, status?: UnifiedTaskStatus): ControlTaskRow {
  const canonicalRisk = requiredRiskForTool(input.taskType);
  const risk = canonicalRisk ?? input.risk ?? 'READ_ONLY';
  if (canonicalRisk && input.risk && input.risk !== canonicalRisk) throw new Error(`Task ${input.taskType} must use risk ${canonicalRisk}.`);
  const initialStatus = status ?? (permissionForRisk(risk).approvalRequired ? 'WAITING_APPROVAL' : 'QUEUED');
  const result = rawSqlite.prepare(`
      INSERT INTO mara_control_tasks
        (task_type, title, payload, status, risk, priority, created_by, assigned_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.taskType, input.title, JSON.stringify(input.payload ?? {}), initialStatus, risk, input.priority ?? 'medium', input.createdBy ?? null, input.assignedAgent ?? null);
  const taskId = Number(result.lastInsertRowid);
  recordEvent(taskId, 'created', null, initialStatus, input.createdBy ?? null, { taskType: input.taskType });
  const task = getControlTask(taskId);
  if (!task) throw new Error(`Control task was not created: ${taskId}`);
  return task;
}

export function getControlTask(id: number): ControlTaskRow | null {
  const row = rawSqlite.prepare('SELECT * FROM mara_control_tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToTask(row) : null;
}

/** Finds the validation task control-task-worker auto-created for a given repository.apply_changes task, if any. */
export function findValidationTaskForProposal(proposalTaskId: number): ControlTaskRow | null {
  const row = rawSqlite.prepare(`
    SELECT * FROM mara_control_tasks
    WHERE task_type IN ('project.typecheck','server.build','frontend.typecheck','frontend.build')
      AND json_extract(payload, '$.validationForTaskId') = ?
    ORDER BY id DESC LIMIT 1
  `).get(proposalTaskId) as Record<string, unknown> | undefined;
  return row ? rowToTask(row) : null;
}

export function listControlTasks(limit = 100): ControlTaskRow[] {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const rows = rawSqlite.prepare('SELECT * FROM mara_control_tasks ORDER BY updated_at DESC, id DESC LIMIT ?').all(safeLimit) as Array<Record<string, unknown>>;
  return rows.map(rowToTask);
}

export function listControlTaskEvents(taskId: number, limit = 100): Array<Record<string, unknown>> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return rawSqlite.prepare(`
    SELECT id, task_id, event_type, from_status, to_status, actor, metadata, created_at
    FROM mara_control_task_events
    WHERE task_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(taskId, safeLimit) as Array<Record<string, unknown>>;
}

export function listControlAdminActions(limit = 100): Array<Record<string, unknown>> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return rawSqlite.prepare(`
    SELECT id, action_type, target_type, target_id, actor, metadata, created_at
    FROM mara_admin_actions
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(safeLimit) as Array<Record<string, unknown>>;
}

export function approveControlTask(id: number, actor: string): ControlTaskRow | null {
  const current = getControlTask(id);
  if (!current) return null;
  if (!permissionForRisk(current.risk).approvalRequired) return current;
  const next = transitionTask(current.status, 'PLANNING');
  rawSqlite.transaction(() => {
    rawSqlite.prepare(`UPDATE mara_control_tasks SET status = ?, approved_by = ?, approved_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`).run(next, actor, id);
    recordEvent(id, 'approved', current.status, next, actor);
    recordControlAdminAction('control_task.approved', id, actor);
  })();
  return getControlTask(id);
}

export function cancelControlTask(id: number, actor: string): ControlTaskRow | null {
  const current = getControlTask(id);
  if (!current) return null;
  const next = transitionTask(current.status, 'CANCELLED');
  rawSqlite.transaction(() => {
    rawSqlite.prepare('UPDATE mara_control_tasks SET status = ?, updated_at = unixepoch() WHERE id = ?').run(next, id);
    recordEvent(id, 'cancelled', current.status, next, actor);
    recordControlAdminAction('control_task.cancelled', id, actor);
  })();
  return getControlTask(id);
}

export function reviewControlTask(id: number, decision: 'approved' | 'rejected', actor: string): ControlTaskRow | null {
  const current = getControlTask(id);
  if (!current || current.status !== 'COMPLETED' || !['project.typecheck', 'server.build', 'frontend.typecheck', 'frontend.build'].includes(current.taskType)) return null;
  rawSqlite.transaction(() => {
    rawSqlite.prepare(`UPDATE mara_control_tasks SET review_decision = ?, reviewed_by = ?, reviewed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`).run(decision, actor, id);
    recordEvent(id, `review_${decision}`, current.status, current.status, actor);
    recordControlAdminAction(`control_task.review_${decision}`, id, actor);
  })();
  return getControlTask(id);
}

export function claimNextControlTask(workerId: string): ControlTaskRow | null {
  const transaction = rawSqlite.transaction(() => {
    const row = rawSqlite.prepare(`
      SELECT * FROM mara_control_tasks
      WHERE (status = 'PLANNING' OR (status = 'QUEUED' AND risk IN ('READ_ONLY','LOW_RISK')))
        AND attempts < max_attempts
        AND (next_attempt_at IS NULL OR next_attempt_at <= unixepoch())
      ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at ASC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    if (!row) return null;
    const current = rowToTask(row);
    if (current.status === 'QUEUED') {
      rawSqlite.prepare('UPDATE mara_control_tasks SET status = ?, updated_at = unixepoch() WHERE id = ?').run('PLANNING', current.id);
      recordEvent(current.id, 'planned', current.status, 'PLANNING', workerId);
    }
    rawSqlite.prepare(`
      UPDATE mara_control_tasks
      SET status = 'RUNNING', worker_id = ?, attempts = attempts + 1, started_at = unixepoch(), updated_at = unixepoch()
      WHERE id = ? AND (status = 'PLANNING' OR status = 'QUEUED')
    `).run(workerId, current.id);
    recordEvent(current.id, 'started', current.status === 'QUEUED' ? 'PLANNING' : current.status, 'RUNNING', workerId);
    return getControlTask(current.id);
  });
  return transaction() as ControlTaskRow | null;
}

export function claimControlTaskById(id: number, workerId: string): ControlTaskRow | null {
  const transaction = rawSqlite.transaction(() => {
    const row = rawSqlite.prepare(`
      SELECT * FROM mara_control_tasks
      WHERE id = ? AND (status = 'PLANNING' OR (status = 'QUEUED' AND risk IN ('READ_ONLY','LOW_RISK')))
        AND attempts < max_attempts
        AND (next_attempt_at IS NULL OR next_attempt_at <= unixepoch())
      LIMIT 1
    `).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const current = rowToTask(row);
    rawSqlite.prepare(`UPDATE mara_control_tasks SET status = 'RUNNING', worker_id = ?, attempts = attempts + 1, started_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`).run(workerId, id);
    recordEvent(id, 'started', current.status, 'RUNNING', workerId);
    return getControlTask(id);
  });
  return transaction() as ControlTaskRow | null;
}

export function completeControlTask(id: number, workerId: string, result: unknown): ControlTaskRow | null {
  const current = getControlTask(id);
  if (!current || current.status !== 'RUNNING' || current.workerId !== workerId) return null;
  rawSqlite.prepare(`UPDATE mara_control_tasks SET status = 'COMPLETED', result = ?, completed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`).run(JSON.stringify(result), id);
  recordEvent(id, 'completed', current.status, 'COMPLETED', workerId);
  return getControlTask(id);
}

export function failControlTask(id: number, workerId: string, error: string, retryable = true, result?: unknown): ControlTaskRow | null {
  const current = getControlTask(id);
  if (!current || current.status !== 'RUNNING' || current.workerId !== workerId) return null;
  const shouldRetry = retryable && current.attempts < current.maxAttempts;
  const nextStatus = shouldRetry ? 'QUEUED' : 'FAILED';
  const nextAttemptAt = shouldRetry ? Math.floor(Date.now() / 1000) + Math.min(300, 2 ** current.attempts * 5) : null;
  rawSqlite.prepare(`UPDATE mara_control_tasks SET status = ?, error = ?, result = ?, next_attempt_at = ?, completed_at = ?, updated_at = unixepoch() WHERE id = ?`).run(
    nextStatus,
    error.slice(0, 4000),
    result == null ? null : JSON.stringify(result),
    nextAttemptAt,
    shouldRetry ? null : Math.floor(Date.now() / 1000),
    id,
  );
  recordEvent(id, shouldRetry ? 'retry_scheduled' : 'failed', current.status, nextStatus, workerId, { attempts: current.attempts, nextAttemptAt });
  return getControlTask(id);
}

export function recoverStaleControlTasks(maxAgeSeconds = 900): number {
  const result = rawSqlite.prepare(`
    UPDATE mara_control_tasks
    SET status = 'FAILED', error = 'Worker lease expired; manual review required.', completed_at = unixepoch(), updated_at = unixepoch()
    WHERE status = 'RUNNING' AND updated_at < unixepoch() - ?
  `).run(Math.max(60, maxAgeSeconds));
  return result.changes ?? 0;
}
