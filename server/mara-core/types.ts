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
export type PrimaryMetric = 'revenue' | 'user_retention' | 'engagement' | 'growth' | 'grow_platform';

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
 * A concrete, measurable goal aligned to the objective.
 */
export interface ObjectiveGoal {
  id: string;
  label: string;
  targetValue: number;
  unit: string;
  deadline: string; // ISO date string
}

/**
 * A revenue milestone on the path to 1M EUR ARR.
 */
export interface ObjectiveMilestone {
  label: string;
  targetARR: number; // EUR
  deadline: string; // ISO date string
}

/**
 * Key performance indicators tracked against targets.
 */
export interface ObjectiveKPI {
  current?: number;
  target: number;
  unit: string;
}

/**
 * Thresholds that trigger an automated alert in the admin dashboard.
 */
export interface AlertThresholds {
  /** % MRR drop in 30 days that triggers a critical alert. Default 20. */
  mrrDropPct?: number;
  /** Monthly churn rate % above which we alert. Default 10. */
  churnRatePct?: number;
  /** % DAU drop in 7 days that triggers a warning. Default 30. */
  dauDropPct?: number;
  /** LLM error rate % above which we alert. Default 15. */
  llmErrorRatePct?: number;
  /** Conversion rate (signup → paid) below which we alert. Default 2. */
  conversionRatePct?: number;
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
   *  long-tail metrics. Default 365. */
  horizonDays: number;
  weights: ObjectiveWeights;
  /** Human-readable note explaining *why* this objective is set this way.
   *  Useful when reviewing changes in the audit log. */
  rationale?: string;
  /** Concrete, measurable goals aligned to the objective. */
  goals?: ObjectiveGoal[];
  /** Revenue milestones on the path to target ARR. Key = milestone id. */
  milestones?: Record<string, ObjectiveMilestone>;
  /** Topics the brain should research proactively each cycle. */
  researchTopics?: string[];
  /** Platform modules to prioritise in growth analysis. */
  focusModules?: string[];
  /** KPIs tracked against targets. Key = KPI name. */
  kpis?: Record<string, ObjectiveKPI>;
  /** Thresholds for automated alerting. */
  alertThresholds?: AlertThresholds;
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
 * Business-focused ObjectiveFunction targeting 1M EUR ARR.
 * Weights revenue + retention as primary levers; brand safety floor is kept
 * high because user trust is a prerequisite for subscription conversion.
 *
 * Updated on every deploy via UPSERT so new targets take effect automatically
 * — manual overrides via `PUT /api/admin/mara/objective` override this seed.
 */
export const DEFAULT_OBJECTIVE: ObjectiveFunction = {
  primary: 'grow_platform',
  constraints: {
    minUserRetention: 0.35,
    maxSupportResponseTimeMs: 5000,
    minBrandSafetyScore: 0.9,
    maxDailyLLMCalls: 150,
    maxDailyExperiments: 5,
  },
  tradeoffs: {
    growthSpeedVsQuality: 0.65,
    explorationVsExploitation: 0.55,
    userAcquisitionVsRetention: 0.6,
  },
  horizonDays: 365,
  weights: {
    revenue: 0.35,
    retention: 0.30,
    engagement: 0.20,
    brandSafety: 0.15,
  },
  rationale:
    'Obiectiv 1M EUR ARR: focus pe conversie utilizatori gratuiti → abonamente plătite, creator studio, și VIP. ' +
    'Retention și revenue ca metrici principale. Orizont 12 luni.',
  goals: [
    { id: 'mrr_10k', label: 'MRR 10.000 EUR', targetValue: 10000, unit: 'EUR/lună', deadline: '2026-09-01' },
    { id: 'mrr_40k', label: 'MRR 40.000 EUR (ARR 480k)', targetValue: 40000, unit: 'EUR/lună', deadline: '2026-12-31' },
    { id: 'mrr_84k', label: 'MRR 84.000 EUR (ARR 1M)', targetValue: 84000, unit: 'EUR/lună', deadline: '2027-03-31' },
    { id: 'dau_1k', label: '1.000 utilizatori activi zilnic', targetValue: 1000, unit: 'DAU', deadline: '2026-10-01' },
    { id: 'paid_users_500', label: '500 abonamente plătite active', targetValue: 500, unit: 'abonați', deadline: '2026-12-31' },
  ],
  milestones: {
    seed: { label: 'Seed — primii 100 useri plătitori', targetARR: 50000, deadline: '2026-08-01' },
    early: { label: 'Early — ARR 200k EUR', targetARR: 200000, deadline: '2026-10-01' },
    growth: { label: 'Growth — ARR 500k EUR', targetARR: 500000, deadline: '2026-12-31' },
    scale: { label: 'Scale — ARR 1M EUR', targetARR: 1000000, deadline: '2027-03-31' },
  },
  researchTopics: [
    'Creator economy — cum să monetizezi o platformă de content în 2025',
    'SaaS subscription conversion — best practices pentru freemium → paid',
    'Viral growth loops pentru platforme sociale cu AI',
    'Retentie utilizatori pe platforme de content — churn reduction strategies',
    'Pricing strategy pentru AI-powered SaaS în Europa',
    'Community building și engagement pentru creator platforms',
    'AI companion UX — personalizare și fidelizare utilizatori',
    'Growth hacking pentru startup-uri B2C în România și Europa',
  ],
  focusModules: ['creator', 'writers', 'chat', 'vip', 'reels'],
  kpis: {
    mrr: { target: 84000, unit: 'EUR/lună' },
    dau: { target: 1000, unit: 'utilizatori/zi' },
    retention7d: { target: 0.45, unit: 'rată' },
    conversionRate: { target: 0.05, unit: 'rată' },
    avgRevenuePerUser: { target: 15, unit: 'EUR/lună' },
  },
  alertThresholds: {
    mrrDropPct: 20,
    churnRatePct: 10,
    dauDropPct: 30,
    llmErrorRatePct: 15,
    conversionRatePct: 2,
  },
};
