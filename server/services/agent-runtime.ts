import { AGENT_CATALOG } from './agent-catalog.js';
import { createControlTask, type ControlTaskRow } from './control-task-engine.js';
import { isSafeToolRegistered } from './tool-runtime.js';
import { requiredRiskForTool } from './tool-runtime.js';

const agentTools: Record<string, readonly string[]> = {
  'code-explorer': ['repository.overview', 'repository.git_status', 'repository.search', 'repository.preview'],
  'testing-agent': ['project.typecheck', 'server.build', 'frontend.typecheck', 'frontend.build', 'python.execute'],
  'code-agent': ['code-agent.plan'],
};

export function createAgentTask(input: {
  agentId: string;
  toolType: string;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
  moduleId?: string | null;
  moduleName?: string | null;
}): ControlTaskRow {
  const agent = AGENT_CATALOG.find((entry) => entry.id === input.agentId);
  if (!agent) throw new Error(`Agent is not registered: ${input.agentId}`);
  const allowedTools = agentTools[input.agentId] ?? [];
  if (!allowedTools.includes(input.toolType)) {
    throw new Error(`Agent ${input.agentId} is not allowed to use ${input.toolType}`);
  }
  if (!isSafeToolRegistered(input.toolType)) {
    throw new Error(`Tool is not registered: ${input.toolType}`);
  }
  const requiredRisk = requiredRiskForTool(input.toolType);
  if (!requiredRisk) throw new Error(`Tool risk is not configured: ${input.toolType}`);
  return createControlTask({
    taskType: input.toolType,
    title: input.moduleName ? `${agent.label}: ${input.toolType} (${input.moduleName})` : `${agent.label}: ${input.toolType}`,
    payload: { ...(input.payload ?? {}), ...(input.moduleId ? { moduleId: input.moduleId, moduleName: input.moduleName ?? input.moduleId } : {}) },
    risk: requiredRisk as 'READ_ONLY' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'CRITICAL',
    priority: 'medium',
    createdBy: input.createdBy ?? null,
    assignedAgent: input.agentId,
  });
}

export function allowedAgentTools(agentId: string): readonly string[] {
  return agentTools[agentId] ?? [];
}
