import { getAIHealth, type AIHealthSnapshot } from '../llm.js';
import { brainManager, type BrainStatus } from './manager.js';

export interface BrainControlSnapshot {
  brain: BrainStatus;
  ai: AIHealthSnapshot;
}

/** Shared read capability for Web Admin and the Mara Control Center. */
export async function getBrainControlSnapshot(): Promise<BrainControlSnapshot> {
  return {
    brain: brainManager.status(),
    ai: await getAIHealth(),
  };
}
