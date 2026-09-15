import type { UnifiedTaskStatus } from './task-engine.js';

const transitions: Record<UnifiedTaskStatus, readonly UnifiedTaskStatus[]> = {
  QUEUED: ['PLANNING', 'CANCELLED'],
  PLANNING: ['RUNNING', 'WAITING_APPROVAL', 'FAILED', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'FAILED', 'WAITING_APPROVAL', 'CANCELLED'],
  WAITING_APPROVAL: ['PLANNING', 'RUNNING', 'CANCELLED'],
  COMPLETED: [],
  FAILED: ['QUEUED', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransitionTask(from: UnifiedTaskStatus, to: UnifiedTaskStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionTask(from: UnifiedTaskStatus, to: UnifiedTaskStatus): UnifiedTaskStatus {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
  return to;
}

export function allowedTaskTransitions(from: UnifiedTaskStatus): readonly UnifiedTaskStatus[] {
  return transitions[from];
}
