import type { TaskRisk } from './task-policy.js';

export type PermissionLevel = 'READ_ONLY' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'CRITICAL';

export interface PermissionDecision {
  level: PermissionLevel;
  approvalRequired: boolean;
  reason: string;
}

/** Pure policy only. It never authenticates, authorizes, or executes an action. */
export function permissionForRisk(risk: TaskRisk): PermissionDecision {
  switch (risk) {
    case 'READ_ONLY':
      return { level: 'READ_ONLY', approvalRequired: false, reason: 'Read-only inspection.' };
    case 'LOW_RISK':
      return { level: 'LOW_RISK', approvalRequired: false, reason: 'Low-risk local processing.' };
    case 'MODERATE_RISK':
      return { level: 'MODERATE_RISK', approvalRequired: true, reason: 'May change task or user-visible state.' };
    case 'HIGH_RISK':
      return { level: 'HIGH_RISK', approvalRequired: true, reason: 'Requires explicit administrative approval.' };
    case 'CRITICAL':
      return { level: 'CRITICAL', approvalRequired: true, reason: 'Irreversible or security-sensitive action.' };
  }
}
