import { getBrainControlSnapshot } from '../mara-brain/control-service.js';
import { getAIHealth } from '../llm.js';
import { readTaskStatus } from './task-engine.js';
import {
  readRepositoryFile,
  readRepositoryGitStatus,
  readRepositorySearch,
  readRepositoryStatus,
} from './repository-status.js';
import { permissionForRisk } from './permission-policy.js';
import type { ControlTaskRow } from './control-task-engine.js';
import { getControlTask, recordControlTaskEvent } from './control-task-engine.js';
import { callBridge, type BridgeAction } from './bridge-client.js';
import { planCodeAgentRequest } from './code-agent.js';
import { requiredRiskForTool as getRequiredRiskForTool } from './tool-policy.js';
import { prepareGitHubWriteOperation, readGitHubStatus } from './github/operations.js';
import { prepareRailwayWriteOperation, readRailwayStatus } from './railway/operations.js';
import { runPythonScript } from './python-sandbox.js';

export type ToolExecutionResult = unknown;

type ToolHandler = (payload: Record<string, unknown>, task: ControlTaskRow) => Promise<ToolExecutionResult>;

const handlers: Record<string, ToolHandler> = {
  'brain.snapshot': async () => getBrainControlSnapshot(),
  'ollama.health': async () => getAIHealth(),
  'tasks.status': async () => readTaskStatus(),
  'repository.overview': async () => readRepositoryStatus(),
  'repository.git_status': async () => readRepositoryGitStatus(),
  'github.status': async () => readGitHubStatus(),
  'github.write_plan': async (payload) => prepareGitHubWriteOperation(readGitHubWriteOperation(payload.operation), payload.payload && typeof payload.payload === 'object' ? payload.payload as Record<string, unknown> : {}, String(payload.reason ?? 'Owner requested GitHub write operation planning.')),
  'railway.status': async () => readRailwayStatus(),
  'railway.write_plan': async (payload) => prepareRailwayWriteOperation(readRailwayWriteOperation(payload.operation), payload.payload && typeof payload.payload === 'object' ? payload.payload as Record<string, unknown> : {}, String(payload.reason ?? 'Owner requested Railway write operation planning.')),
  'repository.search': async (payload) => readRepositorySearch(String(payload.query ?? ''), Number(payload.limit ?? 20)),
  'repository.preview': async (payload) => readRepositoryFile(String(payload.path ?? ''), Number(payload.maxBytes ?? 6_000)),
  'repository.apply_changes': async (payload) => callBridge('repository.apply_changes', payload),
  'project.typecheck': async (_payload, task) => runBridgeCommand('project.typecheck', task),
  'server.build': async (_payload, task) => runBridgeCommand('server.build', task),
  'frontend.typecheck': async (_payload, task) => runBridgeCommand('frontend.typecheck', task),
  'frontend.build': async (_payload, task) => runBridgeCommand('frontend.build', task),
  'git.create_branch': async (payload) => callBridge('git.create_branch', payload),
  'git.commit_staged': async (payload) => callBridge('git.commit_staged', payload),
  'git.stage_proposal': async (payload) => callBridge('git.stage_proposal', payload),
  'git.push': async (payload) => callBridge('git.push', payload),
  'code-agent.plan': async (payload) => planCodeAgentRequest(Number(payload.requestId)),
  'python.execute': async (payload) => runPythonScript(String(payload.code ?? ''), {
    timeoutMs: typeof payload.timeoutMs === 'number' ? payload.timeoutMs : undefined,
  }),
};

function readGitHubWriteOperation(value: unknown): Parameters<typeof prepareGitHubWriteOperation>[0] {
  const allowed = ['create_branch', 'write_file', 'create_issue', 'update_issue', 'create_pull_request'] as const;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as Parameters<typeof prepareGitHubWriteOperation>[0];
  throw new Error(`github.write_plan operation must be one of: ${allowed.join(', ')}`);
}

function readRailwayWriteOperation(value: unknown): Parameters<typeof prepareRailwayWriteOperation>[0] {
  const allowed = ['deploy', 'redeploy', 'restart', 'update_variables'] as const;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as Parameters<typeof prepareRailwayWriteOperation>[0];
  throw new Error(`railway.write_plan operation must be one of: ${allowed.join(', ')}`);
}

async function runBridgeCommand(command: BridgeAction, task: ControlTaskRow) {
  recordControlTaskEvent(task.id, 'PROCESS_STARTING', { command, via: 'bridge' });
  const result = await callBridge(command, { taskId: task.id }) as { exitCode: number | null; state: string; errorClass: string };
  if (result.exitCode !== 0 || result.state !== 'COMPLETED' || result.errorClass !== 'none') {
    recordControlTaskEvent(task.id, 'PROCESS_FAILED', { command, exitCode: result.exitCode });
    const error = new Error(`${command} failed: ${result.errorClass}, exitCode=${result.exitCode ?? 'null'}`) as Error & { executionResult?: unknown };
    error.executionResult = result;
    throw error;
  }
  recordControlTaskEvent(task.id, 'PROCESS_COMPLETED', { command, exitCode: result.exitCode });
  return result;
}

function validatePayload(toolType: string, payload: Record<string, unknown>): void {
  if (toolType === 'repository.search' && typeof payload.query !== 'string') {
    throw new Error('repository.search requires a string query');
  }
  if (toolType === 'repository.preview' && typeof payload.path !== 'string') {
    throw new Error('repository.preview requires a string path');
  }
  if (toolType === 'repository.apply_changes' && !Array.isArray(payload.changes)) {
    throw new Error('repository.apply_changes requires a changes array');
  }
  if (['project.typecheck', 'server.build', 'frontend.typecheck', 'frontend.build'].includes(toolType)) {
    const keys = Object.keys(payload);
    if (keys.some((key) => key !== 'validationForTaskId') || (payload.validationForTaskId !== undefined && typeof payload.validationForTaskId !== 'number')) {
      throw new Error(`${toolType} accepts only internal validationForTaskId metadata`);
    }
  }
  if (toolType === 'git.create_branch' && typeof payload.branch !== 'string') throw new Error('git.create_branch requires a branch');
  if (toolType === 'git.stage_proposal' && (!Array.isArray(payload.paths) || typeof payload.proposalTaskId !== 'number' || typeof payload.validationTaskId !== 'number')) {
    throw new Error('git.stage_proposal requires paths, proposalTaskId, and validationTaskId');
  }
  if (toolType === 'git.commit_staged' && (typeof payload.message !== 'string' || typeof payload.validationTaskId !== 'number' || typeof payload.proposalTaskId !== 'number')) {
    throw new Error('git.commit_staged requires a message, proposalTaskId, and validationTaskId');
  }
  if (toolType === 'git.push' && typeof payload.commitTaskId !== 'number') throw new Error('git.push requires a commitTaskId');
  if (toolType === 'code-agent.plan' && typeof payload.requestId !== 'number') throw new Error('code-agent.plan requires requestId');
  if (toolType === 'python.execute' && (typeof payload.code !== 'string' || !payload.code.trim())) throw new Error('python.execute requires non-empty code');
  if (toolType === 'github.write_plan' && typeof payload.operation !== 'string') throw new Error('github.write_plan requires an operation');
  if (toolType === 'railway.write_plan' && typeof payload.operation !== 'string') throw new Error('railway.write_plan requires an operation');
}

/**
 * Single safe tool runtime. Only registered, policy-checked local handlers are executable.
 * No shell, arbitrary module loading, network dispatch, or deployment handler exists here.
 */
export async function executeSafeTool(task: ControlTaskRow): Promise<ToolExecutionResult> {
  const handler = handlers[task.taskType];
  if (!handler) throw new Error(`Tool is not registered: ${task.taskType}`);
  const permission = permissionForRisk(task.risk);
  const approvedWriteTool = ['repository.apply_changes', 'git.create_branch', 'git.stage_proposal', 'git.commit_staged', 'git.push', 'github.write_plan', 'railway.write_plan'].includes(task.taskType);
  const approvalRequired = ['MODERATE_RISK', 'HIGH_RISK', 'CRITICAL'].includes(permission.level);
  if (approvalRequired && !task.approvedBy) {
    throw new Error(`Tool execution requires administrative approval: ${task.taskType}`);
  }
  if (permission.level === 'HIGH_RISK' && !(approvedWriteTool && task.approvedBy)) {
    throw new Error(`Tool execution requires approval-bound handler: ${task.taskType}`);
  }
  validatePayload(task.taskType, task.payload);
  if (task.taskType === 'git.stage_proposal') {
    const validationTask = getControlTask(Number(task.payload.validationTaskId));
    const proposalTask = getControlTask(Number(task.payload.proposalTaskId));
    if (!validationTask || !proposalTask || validationTask.status !== 'COMPLETED' || validationTask.reviewDecision !== 'approved' || Number(validationTask.payload.validationForTaskId) !== proposalTask.id) {
      throw new Error('git.stage_proposal requires a reviewed, successful validation task linked to the approved proposal');
    }
  }
  if (task.taskType === 'git.commit_staged') {
    const validationTask = getControlTask(Number(task.payload.validationTaskId));
    const proposalTask = getControlTask(Number(task.payload.proposalTaskId));
    const validationFor = validationTask?.payload.validationForTaskId;
    if (!validationTask || !proposalTask || validationTask.status !== 'COMPLETED' || validationTask.reviewDecision !== 'approved' || !['project.typecheck', 'server.build', 'frontend.typecheck', 'frontend.build'].includes(validationTask.taskType) || Number(validationFor) !== proposalTask.id || validationTask.createdAt < proposalTask.createdAt) {
      throw new Error('git.commit_staged requires a reviewed, successful validation task linked to the approved proposal');
    }
  }
  if (task.taskType === 'git.push') {
    const commitTask = getControlTask(Number(task.payload.commitTaskId));
    if (!commitTask || commitTask.taskType !== 'git.commit_staged' || commitTask.status !== 'COMPLETED') {
      throw new Error('git.push requires a completed git.commit_staged task');
    }
  }
  return handler({ ...task.payload, taskId: task.id }, task);
}

export function isSafeToolRegistered(toolType: string): boolean {
  return Boolean(handlers[toolType]);
}

export function requiredRiskForTool(toolType: string): string | null {
  return getRequiredRiskForTool(toolType);
}
