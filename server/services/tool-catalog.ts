export type ToolCatalogEntry = {
  id: string;
  label: string;
  description: string;
  risk: 'READ_ONLY' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'CRITICAL';
  available: boolean;
  execution: 'local_capability' | 'not_configured' | 'approval_required';
};

/** Descriptive registry only. Handlers remain explicit in the worker. */
export function readToolCatalog(): ToolCatalogEntry[] {
  return [
    { id: 'brain.snapshot', label: 'Brain status', description: 'Read Brain and AI provider state.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'ollama.health', label: 'Ollama health', description: 'Check the configured local AI provider through the existing router.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'tasks.status', label: 'Task status', description: 'Read unified task state.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'repository.overview', label: 'Repository overview', description: 'Read indexed repository metadata.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'repository.search', label: 'Repository search', description: 'Search the bounded code index.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'repository.preview', label: 'Source preview', description: 'Read a bounded, validated source file.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'repository.apply_changes', label: 'Apply approved changes', description: 'Apply approved, hash-guarded source changes in the allowed workspace.', risk: 'HIGH_RISK', available: true, execution: 'approval_required' },
    { id: 'project.typecheck', label: 'Project typecheck', description: 'Run the fixed project TypeScript validation command.', risk: 'LOW_RISK', available: true, execution: 'local_capability' },
    { id: 'server.build', label: 'Server build', description: 'Run the fixed server production build command.', risk: 'LOW_RISK', available: true, execution: 'local_capability' },
    { id: 'frontend.typecheck', label: 'Frontend typecheck', description: 'Run the fixed frontend TypeScript build check.', risk: 'LOW_RISK', available: true, execution: 'local_capability' },
    { id: 'frontend.build', label: 'Frontend build', description: 'Run the fixed frontend production build command.', risk: 'LOW_RISK', available: true, execution: 'local_capability' },
    { id: 'git.create_branch', label: 'Create Git branch', description: 'Create a branch after explicit approval.', risk: 'HIGH_RISK', available: true, execution: 'approval_required' },
    { id: 'git.commit_staged', label: 'Commit staged changes', description: 'Commit already-staged changes without running hooks after explicit approval.', risk: 'HIGH_RISK', available: true, execution: 'approval_required' },
    { id: 'git.stage_proposal', label: 'Stage approved proposal', description: 'Stage only approved proposal paths after validation review.', risk: 'HIGH_RISK', available: true, execution: 'approval_required' },
    { id: 'git.push', label: 'Push to origin', description: 'Push the current branch after a linked, completed commit task.', risk: 'HIGH_RISK', available: true, execution: 'approval_required' },
    { id: 'code-agent.plan', label: 'Code Agent plan', description: 'Generate a repository-aware plan through the existing Mara LLM router.', risk: 'LOW_RISK', available: true, execution: 'local_capability' },
    { id: 'repository.git_status', label: 'Git status', description: 'Read branch, diff, and recent commits.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'github.status', label: 'GitHub status', description: 'Read GitHub App repository, branches, commits, issues, PRs, and Actions status.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'github.write_plan', label: 'GitHub write plan', description: 'Prepare a GitHub write operation for owner confirmation; does not execute remote writes.', risk: 'HIGH_RISK', available: true, execution: 'approval_required' },
    { id: 'railway.status', label: 'Railway status', description: 'Read linked Railway project, service, deployment and logs metadata without exposing variables.', risk: 'READ_ONLY', available: true, execution: 'local_capability' },
    { id: 'railway.write_plan', label: 'Railway write plan', description: 'Prepare a Railway deployment/restart/configuration plan for owner confirmation; does not execute it.', risk: 'HIGH_RISK', available: true, execution: 'approval_required' },
    { id: 'voice', label: 'Voice control', description: 'Speech input/output command layer.', risk: 'MODERATE_RISK', available: false, execution: 'not_configured' },
  ];
}
