// =============================================================================
// MaraCore — Single-Brain Architecture Foundation Types
// =============================================================================
//
// This file declares the data model the eventual single-brain orchestrator
// will operate on. **NO LOGIC LIVES HERE** — these are pure shapes. The
// existing brain (`server/mara-brain/`) continues to run unchanged; over
// successive PRs its responsibilities are folded into a MaraCore that
// reasons against these types.
//
// Source-of-truth design doc: the MaraCore spec (the "north star"). This
// file mirrors §1.1 of that spec, with two intentional naming concessions:
//
//   1. We use camelCase on the wire / in TS code. The spec uses snake_case
//      to match a Python/SQL-leaning reference implementation, but the
//      MaraAI codebase is camelCase throughout. The persisted JSON column
//      stores the camelCase form so reads round-trip without a translation
//      step.
//   2. `Decision.status` includes `'rejected'` (admin rejection) in
//      addition to the spec's `proposed | approved | executing | completed
//      | failed`. The existing `mara_growth_experiments` table already
//      tracks rejection via the admin UI; widening the union here lets us
//      reuse those rows directly when we migrate them.
//
// What lives where:
//   - server/mara-core/types.ts        — shapes only (this file)
//   - server/mara-core/objective.ts    — load/save of the singular
//                                        ObjectiveFunction row
//   - server/mara-brain/*              — current orchestrator (untouched
//                                        in this PR)
//
// Etapa 1 (this PR) wires the ObjectiveFunction into storage + an admin
// endpoint. Future PRs introduce CognitiveState, Goal, Decision, and the
// ExecutiveReasoning layer that consumes them.

// =============================================================================
// OBJECTIVE FUNCTION — the North Star the brain optimises against
// =============================================================================

/**
 * The single metric the brain treats as the primary lever.
 *
 * Choosing one means every secondary metric must be expressed either as a
 * constraint (must not be violated) or as a weight (counts toward the
 * compound score). `growth` is the default for an early-stage product —
 * once retention is meaningful, this typically rotates to `user_retention`.
 */
export type PrimaryMetric = 'revenue' | 'user_retention' | 'engagement' | 'growth';

/**
 * Hard constraints — violating any of these short-circuits decision making.
 *
 * `min_user_retention` is the floor below which we refuse to ship
 * experiments that might worsen retention (even if they'd grow revenue).
 * `max_daily_llm_calls` is the cap enforced by the universal rate-limit
 * funnel introduced in PR #96; mirroring it here means the ObjectiveFunction
 * is the single place to tune it instead of an env var.
 */
export interface ObjectiveConstraints {
  /** 0–1. Floor on the rolling 7-day retention rate. */
  minUserRetention: number;
  /** Hard cap on p50 support response time, in milliseconds. */
  maxSupportResponseTimeMs: number;
  /** 0–1. Floor on the brand-safety classifier score. */
  minBrandSafetyScore: number;
  /** Daily cap on autonomous LLM calls (excluding `user_chat`). */
  maxDailyLLMCalls: number;
  /** Daily cap on new growth experiments proposed by the cycle. */
  maxDailyExperiments: number;
}

/**
 * Trade-off knobs. Each value is in 0..1; the spec uses `0.6` to mean
 * "60% weight to the first half of the name, 40% to the second". The
 * orchestrator multiplies these into candidate decisions' scores before
 * picking a winner.
 */
export interface ObjectiveTradeoffs {
  /** 0..1. Higher = ship faster even at lower confidence. */
  growthSpeedVsQuality: number;
  /** 0..1. Higher = bet on novel experiments over re-using winners. */
  explorationVsExploitation: number;
  /** 0..1. Higher = prioritise top-of-funnel signups over keeping existing users. */
  userAcquisitionVsRetention: number;
}

/**
 * Linear weights applied to each secondary metric when ranking candidate
 * decisions. They sum to ~1 by convention, but the orchestrator normalises
 * before use so non-summing weights are tolerated.
 */
export interface ObjectiveWeights {
  revenue: number;
  retention: number;
  engagement: number;
  brandSafety: number;
}

/**
 * The complete ObjectiveFunction. Stored as a single JSON column in
 * `mara_core_objective` (one row, always id=1) and mutable via
 * `PUT /api/admin/mara/objective`.
 */
export interface ObjectiveFunction {
  primary: PrimaryMetric;
  constraints: ObjectiveConstraints;
  tradeoffs: ObjectiveTradeoffs;
  /** Planning horizon, in days. The orchestrator uses this to discount
   *  long-tail metrics. Default 90. */
  horizonDays: number;
  weights: ObjectiveWeights;
  /** Human-readable note explaining *why* this objective is set this way.
   *  Useful when reviewing changes in the audit log. */
  rationale?: string;
}

// =============================================================================
// GOAL — a specific, measurable target derived from the ObjectiveFunction
// =============================================================================

export type GoalPriority = 'critical' | 'high' | 'medium' | 'low';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface Goal {
  id: string;
  /** Optional parent for hierarchical goals (sub-goals roll up). */
  parentId?: string;
  /** Human-readable objective, e.g. "Increase activation 40% → 60%". */
  objective: string;
  rationale: string;
  successMetric: {
    metric: string;
    baseline: number;
    target: number;
    /** Unix-ms timestamp by which we expect to hit the target. */
    deadlineAt: number;
  };
  /** 0..1. Progress toward the target. */
  progress: number;
  /** 0..1. Confidence we'll hit the target by the deadline. */
  confidence: number;
  priority: GoalPriority;
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// DECISION — a unit of executive reasoning
// =============================================================================

export type DecisionStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed';

export interface DecisionReasoning {
  /** What did we observe in the metrics / world? */
  observation: string;
  /** What do we believe will happen if we act? */
  hypothesis: string;
  /** Which framework (e.g. "AARRR", "Hook Model", "ICE") drove it? */
  framework: string;
  /** 0..1. Expected fractional impact on the primary metric. */
  expectedImpact: number;
  /** 0..1. How sure are we? */
  confidence: number;
  /** Foreign keys into `mara_knowledge_base.id` used to justify the call. */
  citedKnowledgeIds: number[];
}

export interface DecisionOutcome {
  /** Measured fractional impact on the primary metric. */
  actualImpact: number;
  succeeded: boolean;
  /** Plain-text learnings to feed back into the knowledge graph. */
  learnings: string;
  measuredAt: number;
}

export interface Decision {
  id: string;
  /** Free-text action verb-noun, e.g. "propose_experiment:onboarding-hook". */
  action: string;
  reasoning: DecisionReasoning;
  status: DecisionStatus;
  outcome?: DecisionOutcome;
  createdAt: number;
  executedAt?: number;
  measuredAt?: number;
}

// =============================================================================
// FEEDBACK — a measured signal that updates the cognitive state
// =============================================================================

export type FeedbackType = 'user_action' | 'metric_change' | 'experiment_result' | 'error';
export type FeedbackDirection = 'positive' | 'negative' | 'neutral';

export interface Feedback {
  type: FeedbackType;
  event: string;
  timestamp: number;
  impact: {
    metric: string;
    delta: number;
    direction: FeedbackDirection;
  };
  /** 0..1. How significant is this signal vs. routine noise? */
  significance: number;
  suggestedAction?: string;
}

// =============================================================================
// COGNITIVE STATE — a snapshot of what the brain knows / is doing right now
// =============================================================================

export type BrainMode = 'learning' | 'optimizing' | 'exploring' | 'consolidating';

export interface CognitiveState {
  knowledge: {
    totalEntries: number;
    /** category → count, where category matches `mara_knowledge_base.category`. */
    categories: Record<string, number>;
    lastConsolidationAt: number | null;
    graphVersion: number;
  };
  activeGoals: Goal[];
  /** Experiment row IDs currently in flight. */
  activeExperimentIds: number[];
  pendingDecisions: Decision[];
  metrics: {
    revenue7d: number;
    retention7d: number;
    engagement7d: number;
    brandSafetyScore: number;
    llmCallsToday: number;
    experimentsToday: number;
  };
  confidence: {
    revenueForecast: number;
    retentionForecast: number;
    growthForecast: number;
  };
  mode: BrainMode;
  lastUpdateAt: number;
  lastDecisionAt: number | null;
  lastMeasurementAt: number | null;
}

// =============================================================================
// DEFAULTS — used by the bootstrap seed
// =============================================================================

/**
 * The default ObjectiveFunction Mara starts with for an early-stage SaaS.
 * Tuned for an audience of zero-to-few hundred users where growth and
 * retention matter equally and revenue isn't yet measurable.
 *
 * Edit via `PUT /api/admin/mara/objective`; this is only used to seed
 * `mara_core_objective` when the table is first populated.
 */
export const DEFAULT_OBJECTIVE: ObjectiveFunction = {
  primary: 'growth',
  constraints: {
    minUserRetention: 0.4,
    maxSupportResponseTimeMs: 5000,
    minBrandSafetyScore: 0.9,
    // Matches the funnel default in `mara-brain/rate-limiter.ts`; if you
    // raise one, raise the other.
    maxDailyLLMCalls: 100,
    maxDailyExperiments: 3,
  },
  tradeoffs: {
    growthSpeedVsQuality: 0.55,
    explorationVsExploitation: 0.6,
    userAcquisitionVsRetention: 0.5,
  },
  horizonDays: 90,
  weights: {
    revenue: 0.1,
    retention: 0.35,
    engagement: 0.3,
    brandSafety: 0.25,
  },
  rationale:
    'Early-stage default: optimise for growth, but require minimum retention + brand safety. Revisit once we have 50+ retained users.',
};
