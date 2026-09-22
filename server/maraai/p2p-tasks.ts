// P2P Background Compute — task queue.
//
// Browser nodes (idle users) poll GET /api/p2p/get-task, run lightweight JS
// computation in a Web Worker, POST the result to /api/p2p/submit-result and
// earn 1 Mara Credit per completed task.
//
// Task types and what the browser actually computes:
//   maraAnalysis      — aggregate engagement stats from a provided data slice
//   missionGeneration — template-based mission text selection / formatting
//   contentProcessing — word-count, keyword extraction, readability score
//   knowledgeBase     — term-frequency analysis on a text snippet
//
// SECURITY CONSTRAINTS:
//   * Task payloads must never contain other users' PII.
//   * Results are validated server-side before any reward is issued.
//   * A node may hold at most one task at a time; repeated get-task calls
//     return the already-assigned task until it is submitted or times out.
//   * Tasks assigned for > 5 minutes without a result are reset to 'pending'.

import { randomUUID } from 'crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { p2pTasks, type P2PTask, type P2PTaskType } from '../../shared/schema.js';
import { awardCredits, CREDIT_AMOUNTS, CREDIT_REASONS } from './credits.js';
import { logActivity } from './activity.js';
import {
  claimNextTaskAtomically,
  completeTaskAtomically,
} from '../modules/p2p-compute.js';

// Seconds before an assigned-but-unsubmitted task is recycled.
const TASK_TIMEOUT_SEC = 300;

// ── task creation ──────────────────────────────────────────────────────────

export type CreateTaskInput = {
  type: P2PTaskType;
  payload: Record<string, unknown>;
};

export async function createTask(input: CreateTaskInput): Promise<P2PTask> {
  const id = `ptask_${randomUUID()}`;
  const row = {
    id,
    type: input.type,
    payload: JSON.stringify(input.payload),
    status: 'pending' as const,
  };
  await db.insert(p2pTasks).values(row);
  const stored = (await db.select().from(p2pTasks).where(eq(p2pTasks.id, id)).limit(1))[0];
  return stored;
}

// Seed a batch of example tasks so new nodes always find work immediately.
export async function ensureExampleTasks(): Promise<void> {
  const pending = await db
    .select({ id: p2pTasks.id })
    .from(p2pTasks)
    .where(eq(p2pTasks.status, 'pending'))
    .limit(1);
  if (pending.length > 0) return; // already have tasks queued

  const examples: CreateTaskInput[] = [
    {
      type: 'maraAnalysis',
      payload: {
        metric: 'engagement_score',
        data: { activityCounts: [12, 5, 8, 23, 1, 0, 14], windowDays: 7 },
      },
    },
    {
      type: 'missionGeneration',
      payload: { pillar: 'discipline', difficulty: 'gentle', language: 'ro' },
    },
    {
      type: 'contentProcessing',
      payload: {
        text: 'Mara este o platformă de creștere personală care combină inteligența artificială cu comunitatea.',
      },
    },
    {
      type: 'knowledgeBase',
      payload: {
        text: 'Disciplina zilnică construiește obiceiuri sănătoase. Consistența este cheia succesului pe termen lung.',
        category: 'platform_insight',
      },
    },
  ];

  for (const ex of examples) {
    await createTask(ex);
  }
}

// ── task assignment ────────────────────────────────────────────────────────

export type AssignedTask = {
  taskId: string;
  type: P2PTaskType;
  payload: Record<string, unknown>;
};

/**
 * Recycle tasks stuck in 'assigned' for more than TASK_TIMEOUT_SEC.
 * Called lazily before each get-task request.
 */
async function recycleTimedOut(): Promise<void> {
  const cutoff = new Date(Date.now() - TASK_TIMEOUT_SEC * 1000);
  await db
    .update(p2pTasks)
    .set({ status: 'pending', assignedNode: null, assignedUserId: null, claimedBy: null, assignedAt: null })
    .where(
      and(
        sql`${p2pTasks.status} in ('running','assigned')`,
        lt(p2pTasks.assignedAt, cutoff),
      ),
    );
}

/**
 * Return the next pending task assigned to this node, or pull a new one from
 * the queue. Returns null if no tasks are available.
 */
export async function getNextTask(nodeId: string, userId: string): Promise<AssignedTask | null> {
  await recycleTimedOut();
  const next = claimNextTaskAtomically(nodeId, userId, TASK_TIMEOUT_SEC);
  if (!next) return null;
  return {
    taskId: next.id,
    type: next.type as P2PTaskType,
    payload: JSON.parse(next.payload) as Record<string, unknown>,
  };
}

// ── result submission ──────────────────────────────────────────────────────

export type SubmitResultInput = {
  taskId: string;
  nodeId: string;
  userId: string;
  result: Record<string, unknown>;
};

export type SubmitResultOutput = {
  ok: boolean;
  creditsGained: number;
  newCredits: number;
  message: string;
};

/**
 * Validate and persist a task result, then award credits to the node owner.
 */
export async function submitTaskResult(input: SubmitResultInput): Promise<SubmitResultOutput> {
  const task = (
    await db.select().from(p2pTasks).where(eq(p2pTasks.id, input.taskId)).limit(1)
  )[0];

  if (!task) return { ok: false, creditsGained: 0, newCredits: 0, message:'Task not found.' };
  if (!['running', 'assigned'].includes(task.status)) {
    return { ok: false, creditsGained: 0, newCredits: 0, message:'Task already completed or not assigned.' };
  }
  if (task.assignedNode !== input.nodeId) return { ok: false, creditsGained: 0, newCredits: 0, message:'Task assigned to a different node.' };
  if ((task.claimedBy ?? task.assignedUserId) !== input.userId) {
    return { ok: false, creditsGained: 0, newCredits: 0, message:'Task belongs to a different user.' };
  }

  // Validate result is non-empty.
  if (!input.result || Object.keys(input.result).length === 0) {
    return { ok: false, creditsGained: 0, newCredits: 0, message:'Empty result.' };
  }

  const updated = completeTaskAtomically({
    taskId: input.taskId,
    nodeId: input.nodeId,
    userId: input.userId,
    resultJson: JSON.stringify(input.result),
  });
  if (!updated) {
    return { ok: false, creditsGained: 0, newCredits: 0, message:'Task claim is no longer valid.' };
  }

  // Award credits (idempotent via taskId as key).
  const creditResult = await awardCredits({
    userId: input.userId,
    delta: CREDIT_AMOUNTS.p2pBrowserTask,
    reason: CREDIT_REASONS.P2P_BROWSER_TASK,
    idempotencyKey: `browser_task_${input.taskId}`,
    meta: { taskId: input.taskId, taskType: task.type, nodeId: input.nodeId },
  });

  await logActivity(input.userId, 'p2p.browser_task.completed', {
    taskId: input.taskId,
    taskType: task.type,
    creditsGained: CREDIT_AMOUNTS.p2pBrowserTask,
  });

  // Replenish queue: if fewer than 3 pending tasks remain, add more.
  const pendingCount = (
    await db
      .select({ cnt: sql<number>`count(*)` })
      .from(p2pTasks)
      .where(eq(p2pTasks.status, 'pending'))
  )[0]?.cnt ?? 0;

  if (pendingCount < 3) {
    await ensureExampleTasks();
  }

  notifyTaskWaiters(input.taskId, input.result);

  return {
    ok: true,
    creditsGained: CREDIT_AMOUNTS.p2pBrowserTask,
    newCredits: creditResult.balance,
    message: `+${CREDIT_AMOUNTS.p2pBrowserTask} credit Mara! 🌳`,
  };
}

// ── admin stats ────────────────────────────────────────────────────────────

export type P2PAdminStats = {
  activeNodesNow: number;
  tasksPendingNow: number;
  tasksCompletedToday: number;
  tasksCompletedTotal: number;
  estimatedApiSavingsUsd: number;
  topContributors: Array<{ userId: string; tasksCompleted: number }>;
};

const ANTHROPIC_COST_PER_TASK_USD = 0.002; // approx cost of a small Claude call

export async function getAdminStats(activeNodeCount: number): Promise<P2PAdminStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [pendingRes, completedTodayRes, completedTotalRes] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)` }).from(p2pTasks).where(eq(p2pTasks.status, 'pending')),
    db.select({ cnt: sql<number>`count(*)` }).from(p2pTasks).where(
      and(eq(p2pTasks.status, 'completed'), sql`completed_at >= ${Math.floor(todayStart.getTime() / 1000)}`)
    ),
    db.select({ cnt: sql<number>`count(*)` }).from(p2pTasks).where(eq(p2pTasks.status, 'completed')),
  ]);

  const pending = pendingRes[0]?.cnt ?? 0;
  const completedToday = completedTodayRes[0]?.cnt ?? 0;
  const completedTotal = completedTotalRes[0]?.cnt ?? 0;

  // Top contributors: group by assigned_user_id among completed tasks.
  const contributors = await db
    .select({
      userId: p2pTasks.assignedUserId,
      cnt: sql<number>`count(*)`,
    })
    .from(p2pTasks)
    .where(and(eq(p2pTasks.status, 'completed'), sql`assigned_user_id IS NOT NULL`))
    .groupBy(p2pTasks.assignedUserId)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topContributors = contributors
    .filter((r) => r.userId != null)
    .map((r) => ({
      userId: r.userId!,
      tasksCompleted: r.cnt,
    }));

  return {
    activeNodesNow: activeNodeCount,
    tasksPendingNow: pending,
    tasksCompletedToday: completedToday,
    tasksCompletedTotal: completedTotal,
    estimatedApiSavingsUsd: completedTotal * ANTHROPIC_COST_PER_TASK_USD,
    topContributors,
  };
}

// ── P2P fallback helper (used by provider-router) ──────────────────────────

const pendingResults = new Map<string, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();

/** Register a listener that fires when a specific task completes. */
export function waitForTaskResult(taskId: string, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResults.delete(taskId);
      reject(new Error('p2p_task_timeout'));
    }, timeoutMs);

    pendingResults.set(taskId, {
      resolve: (r) => { clearTimeout(timer); resolve(r); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
  });
}

/** Called by submitTaskResult after the DB write — wakes any waiters. */
export function notifyTaskWaiters(taskId: string, result: Record<string, unknown>): void {
  const waiter = pendingResults.get(taskId);
  if (waiter) {
    pendingResults.delete(taskId);
    waiter.resolve(result);
  }
}
