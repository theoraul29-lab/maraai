export type TaskRisk = 'READ_ONLY' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'CRITICAL';
export type TaskSource = 'learning' | 'growth_experiment' | 'p2p';
export type TaskStatus = 'QUEUED' | 'PLANNING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** Pure policy classification; this does not authorize or execute anything. */
export function classifyTaskRisk(source: TaskSource, status: TaskStatus): TaskRisk {
  if (source === 'growth_experiment' && status === 'WAITING_APPROVAL') return 'HIGH_RISK';
  if (source === 'p2p' && status === 'RUNNING') return 'MODERATE_RISK';
  if (source === 'learning' && status === 'RUNNING') return 'LOW_RISK';
  return 'READ_ONLY';
}
