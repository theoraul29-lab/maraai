// CognitiveState — the shared, in-memory snapshot that ExecutiveReasoning
// maintains and makes available to all three brains.
//
// Design constraints:
//   • No DB table — state is rebuilt every brain cycle from live sources.
//   • All fields are plain serialisable values so the admin endpoint can
//     JSON.stringify the whole thing without helpers.
//   • The default (EMPTY_COGNITIVE_STATE) is always a valid state so callers
//     never need to null-check individual fields.

export interface ConversationSignal {
  userId: string;
  module: string | undefined;
  keywords: string[];
  timestamp: number; // unix ms
}

export interface CognitiveState {
  lastUpdated: number; // unix ms — 0 means "never refreshed"

  // Funnel data (refreshed from GrowthEngineer each cycle)
  funnelSummary: string | null;

  // Experiments from mara_growth_experiments
  activeExperiments: string[]; // "[proposed] hypothesis..." strings
  recentOutcomes: string[];    // last 5 learnings from measured experiments

  // Aggregate of conversation signals (extracted from the ring buffer)
  topUserTopics: string[];

  // ObjectiveFunction snapshot
  currentPriority: string;
  focusModules: string[];
}

export const EMPTY_COGNITIVE_STATE: CognitiveState = {
  lastUpdated: 0,
  funnelSummary: null,
  activeExperiments: [],
  recentOutcomes: [],
  topUserTopics: [],
  currentPriority: 'grow_platform',
  focusModules: ['missions', 'creator', 'writers', 'chat', 'vip', 'reels'],
};
