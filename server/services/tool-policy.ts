import type { TaskRisk } from './task-policy.js';

const TOOL_RISKS: Record<string, TaskRisk> = {
  'brain.snapshot': 'READ_ONLY',
  'ollama.health': 'READ_ONLY',
  'tasks.status': 'READ_ONLY',
  'repository.overview': 'READ_ONLY',
  'repository.git_status': 'READ_ONLY',
  'github.status': 'READ_ONLY',
  'github.write_plan': 'HIGH_RISK',
  'railway.status': 'READ_ONLY',
  'railway.write_plan': 'HIGH_RISK',
  'repository.search': 'READ_ONLY',
  'repository.preview': 'READ_ONLY',
  'project.typecheck': 'LOW_RISK',
  'server.build': 'LOW_RISK',
  'frontend.typecheck': 'LOW_RISK',
  'frontend.build': 'LOW_RISK',
  'code-agent.plan': 'LOW_RISK',
  'repository.apply_changes': 'HIGH_RISK',
  'git.create_branch': 'HIGH_RISK',
  'git.stage_proposal': 'HIGH_RISK',
  'git.commit_staged': 'HIGH_RISK',
};

export function requiredRiskForTool(toolType: string): TaskRisk | null {
  return TOOL_RISKS[toolType] ?? null;
}

export function isKnownToolType(toolType: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_RISKS, toolType);
}
