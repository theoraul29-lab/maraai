import {
  claimNextControlTask,
  claimControlTaskById,
  completeControlTask,
  createControlTask,
  failControlTask,
  recoverStaleControlTasks,
  recordControlAdminAction,
  type ControlTaskRow,
} from '../services/control-task-engine.js';
import { executeSafeTool } from '../services/tool-runtime.js';

const POLL_MS = 5_000;
let timer: NodeJS.Timeout | null = null;
let running = false;
const workerId = `local-worker-${process.pid}`;

export function controlTaskWorkerStatus(): { enabled: boolean; running: boolean; workerId: string } {
  return { enabled: process.env.CONTROL_TASK_WORKER_ENABLED === 'true', running: timer !== null, workerId };
}

async function processTask(task: Awaited<ReturnType<typeof claimNextControlTask>>): Promise<void> {
  if (!task) return;
  if (running) return;
  running = true;
  try {
    const result = await executeSafeTool(task);
    const completed = completeControlTask(task.id, workerId, result);
    if (!completed) throw new Error(`Task completion lost ownership: ${task.id}`);
    if (task.taskType === 'repository.apply_changes') {
      const validation = createControlTask({
        taskType: 'project.typecheck',
        title: `Validate repository proposal task #${task.id}`,
        payload: { validationForTaskId: task.id },
        risk: 'LOW_RISK',
        priority: 'high',
        createdBy: task.createdBy,
        assignedAgent: 'testing-agent',
      });
      recordControlAdminAction('validation_task.created', validation.id, workerId, { validationForTaskId: task.id });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const terminal = message.startsWith('Tool is not registered:') || message.startsWith('Tool execution requires approval-bound handler:');
    const executionResult = error && typeof error === 'object' && 'executionResult' in error ? (error as { executionResult?: unknown }).executionResult : undefined;
    failControlTask(task.id, workerId, message, !terminal, executionResult);
  } finally {
    running = false;
  }
}

async function processOne(): Promise<void> {
  if (running) return;
  await processTask(claimNextControlTask(workerId));
}

export async function runOneControlTask(taskId: number): Promise<ControlTaskRow | null> {
  await processTask(claimControlTaskById(taskId, workerId));
  const { getControlTask } = await import('../services/control-task-engine.js');
  return getControlTask(taskId);
}

export function startControlTaskWorker(): void {
  if (process.env.CONTROL_TASK_WORKER_ENABLED !== 'true') return;
  if (timer) return;
  const recovered = recoverStaleControlTasks();
  if (recovered > 0) console.warn(`[control-task-worker] marked ${recovered} stale task(s) as failed`);
  timer = setInterval(() => { void processOne(); }, POLL_MS);
  void processOne();
  console.info(`[control-task-worker] enabled (${workerId}); safe handlers only`);
}

export function stopControlTaskWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
