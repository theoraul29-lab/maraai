import { rawSqlite } from '../db.js';
import { classifyTaskRisk, type TaskRisk } from './task-policy.js';
import { permissionForRisk, type PermissionDecision } from './permission-policy.js';

export type UnifiedTaskStatus = 'QUEUED' | 'PLANNING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export { classifyTaskRisk, type TaskRisk } from './task-policy.js';

export interface UnifiedTask {
  id: string;
  source: 'learning' | 'growth_experiment' | 'p2p' | 'control';
  title: string;
  status: UnifiedTaskStatus;
  priority: string;
  createdAt: number | null;
  metadata: Record<string, unknown>;
  risk: TaskRisk;
  permission: PermissionDecision;
}

export interface TaskStatusSnapshot {
  tasks: UnifiedTask[];
  counts: Record<UnifiedTaskStatus, number>;
  sources: Record<UnifiedTask['source'], number>;
}

function addTask(tasks: UnifiedTask[], task: UnifiedTask): void {
  tasks.push(task);
}

function normalizeLearningStatus(status: string): UnifiedTaskStatus {
  if (status === 'in_progress') return 'RUNNING';
  if (status === 'completed') return 'COMPLETED';
  if (status === 'failed') return 'FAILED';
  return 'QUEUED';
}

function normalizeGrowthStatus(status: string): UnifiedTaskStatus {
  if (status === 'proposed') return 'WAITING_APPROVAL';
  if (status === 'approved') return 'PLANNING';
  if (status === 'implemented') return 'RUNNING';
  if (status === 'measured') return 'COMPLETED';
  if (status === 'rejected') return 'CANCELLED';
  return 'QUEUED';
}

function normalizeP2PStatus(status: string): UnifiedTaskStatus {
  if (status === 'running' || status === 'assigned') return 'RUNNING';
  if (status === 'completed') return 'COMPLETED';
  if (status === 'failed') return 'FAILED';
  return 'QUEUED';
}

/** Read-only facade over existing task tables. It does not create or mutate state. */
export function readTaskStatus(limit = 100): TaskStatusSnapshot {
  const tasks: UnifiedTask[] = [];
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  try {
    const rows = rawSqlite.prepare(`
      SELECT id, topic, priority, status, source, created_at
      FROM mara_learning_queue
      ORDER BY created_at DESC LIMIT ?
    `).all(safeLimit) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const status = normalizeLearningStatus(String(row.status ?? 'pending'));
      addTask(tasks, {
      id: `learning:${row.id}`,
      source: 'learning',
      title: String(row.topic ?? 'Learning task'),
      status,
      priority: String(row.priority ?? 'medium'),
      createdAt: typeof row.created_at === 'number' ? row.created_at : null,
      metadata: { source: row.source ?? 'auto' },
      risk: classifyTaskRisk('learning', status),
      permission: permissionForRisk(classifyTaskRisk('learning', status)),
      });
    }
  } catch { /* table may not exist in older local databases */ }

  try {
    const rows = rawSqlite.prepare(`
      SELECT id, title, task_type, payload, review_decision, status, risk, priority, created_at
      FROM mara_control_tasks
      ORDER BY created_at DESC LIMIT ?
    `).all(safeLimit) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const source = 'control' as const;
      const status = String(row.status ?? 'QUEUED') as UnifiedTaskStatus;
      const risk = String(row.risk ?? 'READ_ONLY') as TaskRisk;
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(String(row.payload ?? '{}')) as Record<string, unknown>; } catch { payload = {}; }
      addTask(tasks, {
        id: `control:${row.id}`,
        source,
        title: String(row.title ?? row.task_type ?? 'Control task'),
        status,
        priority: String(row.priority ?? 'medium'),
        createdAt: typeof row.created_at === 'number' ? row.created_at : null,
        metadata: { taskType: row.task_type ?? null, reviewDecision: row.review_decision ?? null, moduleId: payload.moduleId ?? null, moduleName: payload.moduleName ?? null },
        risk,
        permission: permissionForRisk(risk),
      });
    }
  } catch { /* table may not exist in older local databases */ }

  try {
    const rows = rawSqlite.prepare(`
      SELECT id, hypothesis, status, ice_score, created_at
      FROM mara_growth_experiments
      ORDER BY created_at DESC LIMIT ?
    `).all(safeLimit) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const status = normalizeGrowthStatus(String(row.status ?? 'proposed'));
      addTask(tasks, {
      id: `growth:${row.id}`,
      source: 'growth_experiment',
      title: String(row.hypothesis ?? 'Growth experiment'),
      status,
      priority: 'normal',
      createdAt: typeof row.created_at === 'number' ? row.created_at : null,
      metadata: { iceScore: row.ice_score ?? null },
      risk: classifyTaskRisk('growth_experiment', status),
      permission: permissionForRisk(classifyTaskRisk('growth_experiment', status)),
      });
    }
  } catch { /* table may not exist in older local databases */ }

  try {
    const rows = rawSqlite.prepare(`
      SELECT id, type, status, created_at
      FROM p2p_tasks
      ORDER BY created_at DESC LIMIT ?
    `).all(safeLimit) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const status = normalizeP2PStatus(String(row.status ?? 'pending'));
      addTask(tasks, {
      id: `p2p:${row.id}`,
      source: 'p2p',
      title: String(row.type ?? 'P2P task'),
      status,
      priority: 'normal',
      createdAt: typeof row.created_at === 'number' ? row.created_at : null,
      metadata: {},
      risk: classifyTaskRisk('p2p', status),
      permission: permissionForRisk(classifyTaskRisk('p2p', status)),
      });
    }
  } catch { /* table may not exist in older local databases */ }

  const counts = Object.fromEntries(
    ['QUEUED', 'PLANNING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED']
      .map((status) => [status, 0]),
  ) as Record<UnifiedTaskStatus, number>;
  const sources = { learning: 0, growth_experiment: 0, p2p: 0, control: 0 };
  for (const task of tasks) {
    counts[task.status] += 1;
    sources[task.source] += 1;
  }
  return { tasks, counts, sources };
}
