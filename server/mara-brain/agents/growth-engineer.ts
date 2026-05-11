// Mara Growth Engineer Agent
//
// Mara's new core loop, replacing the generic "platform analysis" phase. Each
// invocation runs the 5-step Growth Engineer cycle:
//
//   1. readFunnelData()             — pull real signup → activation → revenue counts
//   2. identifyDropOffPoint()       — pick the stage with the highest loss %
//   3. proposeGrowthExperiment()    — LLM-backed proposal grounded in the 4
//                                     Growth Engineer books, with an ICE score
//                                     and a code sketch the admin can review
//   4. (handled by admin endpoint)  — POST /api/admin/mara/experiments/:id/approve
//                                     marks an experiment approved + frozen
//   5. measureExperimentOutcome()   — 7 days after `implementedAt`, recompute the
//                                     funnel and write back actual impact +
//                                     learning into mara_knowledge_base
//
// Everything writes to a single source-of-truth table: `mara_growth_experiments`.
// Admin approval/rejection is intentionally *out-of-band*; this agent never
// mutates code on its own. The brain proposes, the human disposes.

import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../db.js';
import {
  users,
  chatMessages,
  userPosts,
  premiumOrders,
  maraGrowthExperiments,
} from '../../../shared/schema.js';
import { searchKnowledge, storeKnowledge } from '../knowledge-base.js';
import { llmGenerate, isLLMConfigured } from '../../llm.js';

// === Types ===
export type DropOffStage =
  | 'signup'
  | 'activation'
  | 'engagement'
  | 'conversion'
  | 'retention';

export type GrowthFramework =
  | 'hook'
  | 'north_star'
  | 'aarrr'
  | 'lean_analytics'
  | 'stripe_atlas'
  | 'first_round';

export interface FunnelStageCount {
  stage: DropOffStage;
  count: number;
  dropOffRateFromPrev: number; // 0-1, fraction of previous stage that did NOT advance
}

export interface FunnelSnapshot {
  windowDays: number;
  windowStart: number; // unix ms
  windowEnd: number; // unix ms
  totalSignups: number;
  stages: FunnelStageCount[];
  // Useful denormalised numbers for prompts
  signupToActivationPct: number;
  activationToEngagementPct: number;
  engagementToConversionPct: number;
  hasMeaningfulData: boolean; // true once totalSignups >= 5 AND at least one stage > 0
}

export interface DropOffPoint {
  stage: DropOffStage;
  dropOffRate: number; // 0-1
  usersAffectedInWindow: number;
  contextNote: string;
}

export interface GrowthExperimentProposal {
  experimentId: number;
  hypothesis: string;
  framework: GrowthFramework;
  codeSketch: string;
  expectedImpactPct: number;
  ice: { impact: number; confidence: number; ease: number; score: number };
  citedKnowledgeIds: number[];
  dropOff: DropOffPoint;
}

export interface MeasuredExperiment {
  experimentId: number;
  status: 'measured' | 'still_waiting' | 'no_baseline' | 'not_found';
  actualImpactPct?: number;
  succeeded?: boolean;
  learnings?: string;
}

// === Step 1: Read funnel data ===

/**
 * Build a 5-stage funnel snapshot for the past `windowDays`.
 *
 * The stages are intentionally generic so that the same loop works regardless
 * of which surface area the platform happens to be optimising next:
 *
 *   signup      — user row was created in the window
 *   activation  — user posted, chatted, or engaged within 24h of signup
 *   engagement  — same user came back on a different day inside the window
 *   conversion  — user produced a paid signal (premium_orders.status=confirmed
 *                 OR users.tier != 'free')
 *   retention   — user was still active in the last 7 days of the window
 *
 * All counts are computed in a single pass over the relevant tables using
 * simple SQL aggregates. We avoid loading per-user rows into memory.
 */
export async function readFunnelData(windowDays = 14): Promise<FunnelSnapshot> {
  const now = Date.now();
  const windowEnd = now;
  const windowStart = now - windowDays * 24 * 60 * 60 * 1000;
  const lookbackDays7 = now - 7 * 24 * 60 * 60 * 1000;

  // --- Signups in window ---
  const signupRows = await db
    .select({
      id: users.id,
      createdAt: users.createdAt,
      tier: users.tier,
    })
    .from(users)
    .where(gte(users.createdAt, new Date(windowStart)));

  const totalSignups = signupRows.length;
  const signupIds = new Set(signupRows.map((r) => r.id));
  const signupCreatedAtById = new Map<string, number>();
  for (const r of signupRows) {
    const ts = r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt) || 0;
    if (r.id) signupCreatedAtById.set(r.id, ts);
  }

  // --- Activation: any chat msg OR post within 24h of signup ---
  // We pull all events in the window and bucket them client-side; the data
  // volume on a single VM is small enough (< 10k rows expected) that one
  // unindexed scan per cycle is fine, and avoids a multi-join nightmare.
  const chatEvents = await db
    .select({ userId: chatMessages.userId, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(gte(chatMessages.createdAt, new Date(windowStart)));
  const postEvents = await db
    .select({ userId: userPosts.userId, createdAt: userPosts.createdAt })
    .from(userPosts)
    .where(gte(userPosts.createdAt, new Date(windowStart)));

  // Map userId -> Set<day-of-year (UTC)> for engagement counting
  const userActivityDays = new Map<string, Set<string>>();
  const userFirstActivityMs = new Map<string, number>();
  const recordEvent = (userId: string | null, createdAt: unknown): void => {
    if (!userId) return;
    const ts = createdAt instanceof Date ? createdAt.getTime() : Number(createdAt) || 0;
    if (!ts) return;
    const dayKey = new Date(ts).toISOString().slice(0, 10);
    let days = userActivityDays.get(userId);
    if (!days) {
      days = new Set<string>();
      userActivityDays.set(userId, days);
    }
    days.add(dayKey);
    const prevFirst = userFirstActivityMs.get(userId);
    if (prevFirst === undefined || ts < prevFirst) {
      userFirstActivityMs.set(userId, ts);
    }
  };
  for (const e of chatEvents) recordEvent(e.userId ?? null, e.createdAt);
  for (const e of postEvents) recordEvent(e.userId ?? null, e.createdAt);

  // Activated = signed up in window AND first activity within 24h of signup
  let activated = 0;
  const activatedIds = new Set<string>();
  for (const id of signupIds) {
    const signupTs = signupCreatedAtById.get(id) ?? 0;
    const firstActivity = userFirstActivityMs.get(id);
    if (firstActivity !== undefined && firstActivity - signupTs <= 24 * 60 * 60 * 1000) {
      activated++;
      activatedIds.add(id);
    }
  }

  // Engaged = activated AND came back on a different day at least once
  let engaged = 0;
  const engagedIds = new Set<string>();
  for (const id of activatedIds) {
    const days = userActivityDays.get(id);
    if (days && days.size >= 2) {
      engaged++;
      engagedIds.add(id);
    }
  }

  // Converted = engaged AND has paid signal (premium order confirmed OR tier != free)
  const paidOrderRows = await db
    .select({ userId: premiumOrders.userId })
    .from(premiumOrders)
    .where(
      and(
        eq(premiumOrders.status, 'confirmed'),
        gte(premiumOrders.createdAt, new Date(windowStart)),
      ),
    );
  const paidUserIds = new Set<string>();
  for (const r of paidOrderRows) {
    if (r.userId) paidUserIds.add(r.userId);
  }
  // Users with non-free tier (premium/vip/creator/trial) count as converted too
  for (const r of signupRows) {
    if (r.tier && r.tier !== 'free') paidUserIds.add(r.id);
  }
  let converted = 0;
  const convertedIds = new Set<string>();
  for (const id of engagedIds) {
    if (paidUserIds.has(id)) {
      converted++;
      convertedIds.add(id);
    }
  }

  // Retained = converted AND has activity in the last 7d of the window
  let retained = 0;
  for (const id of convertedIds) {
    const days = userActivityDays.get(id);
    if (!days) continue;
    for (const dayKey of days) {
      const dayMs = Date.parse(dayKey + 'T00:00:00Z');
      if (dayMs >= lookbackDays7) {
        retained++;
        break;
      }
    }
  }

  const safeRate = (lost: number, prev: number): number =>
    prev > 0 ? Math.max(0, Math.min(1, lost / prev)) : 0;

  const stages: FunnelStageCount[] = [
    {
      stage: 'signup',
      count: totalSignups,
      dropOffRateFromPrev: 0, // top of funnel
    },
    {
      stage: 'activation',
      count: activated,
      dropOffRateFromPrev: safeRate(totalSignups - activated, totalSignups),
    },
    {
      stage: 'engagement',
      count: engaged,
      dropOffRateFromPrev: safeRate(activated - engaged, activated),
    },
    {
      stage: 'conversion',
      count: converted,
      dropOffRateFromPrev: safeRate(engaged - converted, engaged),
    },
    {
      stage: 'retention',
      count: retained,
      dropOffRateFromPrev: safeRate(converted - retained, converted),
    },
  ];

  const signupToActivationPct = totalSignups > 0 ? activated / totalSignups : 0;
  const activationToEngagementPct = activated > 0 ? engaged / activated : 0;
  const engagementToConversionPct = engaged > 0 ? converted / engaged : 0;

  return {
    windowDays,
    windowStart,
    windowEnd,
    totalSignups,
    stages,
    signupToActivationPct,
    activationToEngagementPct,
    engagementToConversionPct,
    hasMeaningfulData: totalSignups >= 5 && stages.some((s) => s.count > 0),
  };
}

// === Step 2: Identify the worst drop-off ===

/**
 * Pick the funnel stage with the highest drop-off rate, ignoring the top of
 * the funnel (signups themselves) and stages where the previous bucket is
 * empty (drop-off rate is meaningless when there's nobody to drop). Ties
 * resolve in favour of the *earlier* stage so the recommended fix shows up
 * upstream in the funnel where it tends to have a larger downstream effect.
 */
export function identifyDropOffPoint(snapshot: FunnelSnapshot): DropOffPoint | null {
  if (!snapshot.hasMeaningfulData) return null;

  // Walk stages in order so ties go to the earlier stage.
  let worst: FunnelStageCount | null = null;
  let prevCount = snapshot.totalSignups;
  for (const stage of snapshot.stages) {
    if (stage.stage === 'signup') {
      prevCount = stage.count;
      continue;
    }
    if (prevCount <= 0) {
      prevCount = stage.count;
      continue;
    }
    if (!worst || stage.dropOffRateFromPrev > worst.dropOffRateFromPrev) {
      worst = stage;
    }
    prevCount = stage.count;
  }
  if (!worst) return null;

  // Recompute "users affected" using the previous stage count for clarity in
  // prompts (e.g. "lost 17 of the 24 activated users at engagement").
  const stageIdx = snapshot.stages.findIndex((s) => s.stage === worst!.stage);
  const prevStage = stageIdx > 0 ? snapshot.stages[stageIdx - 1] : null;
  const lost = prevStage ? Math.max(0, prevStage.count - worst.count) : 0;

  const contextNote = prevStage
    ? `In the last ${snapshot.windowDays} days, ${prevStage.count} users reached "${prevStage.stage}" but only ${worst.count} continued to "${worst.stage}" — ${(worst.dropOffRateFromPrev * 100).toFixed(0)}% drop-off.`
    : `${worst.count} users reached "${worst.stage}" in the last ${snapshot.windowDays} days.`;

  return {
    stage: worst.stage,
    dropOffRate: worst.dropOffRateFromPrev,
    usersAffectedInWindow: lost,
    contextNote,
  };
}

// === Step 3: Propose ONE experiment ===

const FRAMEWORK_LIST: GrowthFramework[] = [
  'hook',
  'north_star',
  'aarrr',
  'lean_analytics',
  'stripe_atlas',
  'first_round',
];

interface RawProposal {
  hypothesis?: string;
  framework?: string;
  codeSketch?: string;
  code_sketch?: string;
  expectedImpactPct?: number;
  expected_impact_pct?: number;
  ice?: { impact?: number; confidence?: number; ease?: number };
}

/**
 * Ask the LLM to propose ONE experiment for the given drop-off, grounded in
 * relevant snippets from the Growth Engineer book knowledge. The function:
 *
 *   - Retrieves up to 6 high-signal knowledge entries via topic search
 *   - Asks the LLM for a strict JSON object
 *   - Validates + normalises the response (snake_case / camelCase agnostic,
 *     ICE values clamped to 1..10, hypothesis non-empty)
 *   - Persists the proposal into `mara_growth_experiments` with
 *     status='proposed' and a frozen snapshot of the funnel as baseline
 *
 * Returns the proposal *with* the new row id so callers can surface it to
 * admins. Returns null if the LLM is not configured or the response cannot
 * be salvaged into a valid experiment.
 */
export async function proposeGrowthExperiment(
  snapshot: FunnelSnapshot,
  dropOff: DropOffPoint,
): Promise<GrowthExperimentProposal | null> {
  if (!isLLMConfigured()) return null;

  // Gather grounding knowledge — we look for entries that mention the funnel
  // stage and the canonical Growth Engineer framework names. Each query
  // returns the top matches by relevance; we de-dupe by id.
  const queries = [
    dropOff.stage,
    'hook model trigger action reward investment',
    'north star metric activation conversion',
    'AARRR pirate metrics funnel growth',
    'lean analytics stage KPI',
    'stripe atlas first round growth',
  ];
  const seen = new Set<number>();
  const knowledgeRows: { id: number; topic: string; content: string }[] = [];
  for (const q of queries) {
    const rows = await searchKnowledge(q, 3);
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      knowledgeRows.push({ id: r.id, topic: r.topic, content: r.content });
      if (knowledgeRows.length >= 6) break;
    }
    if (knowledgeRows.length >= 6) break;
  }

  const knowledgeBlock = knowledgeRows.length
    ? knowledgeRows
        .map((r, i) => `[${i + 1}] (id=${r.id}) ${r.topic}\n${r.content.slice(0, 600)}`)
        .join('\n\n')
    : '(no growth knowledge yet — propose based on general first principles)';

  const funnelBlock = snapshot.stages
    .map((s) => `${s.stage}: ${s.count} (drop-off vs prev: ${(s.dropOffRateFromPrev * 100).toFixed(0)}%)`)
    .join('\n');

  const prompt = `You are Mara, the Growth Engineer for hellomara.net. Your job is to propose ONE single experiment that targets the worst drop-off point in the funnel — and ONLY that one. No brainstorming, no lists. Propose the one experiment you would run this week.

FUNNEL (last ${snapshot.windowDays} days):
${funnelBlock}

WORST DROP-OFF:
- stage: ${dropOff.stage}
- drop-off rate: ${(dropOff.dropOffRate * 100).toFixed(0)}%
- users lost this window: ${dropOff.usersAffectedInWindow}
- context: ${dropOff.contextNote}

GROWTH KNOWLEDGE (cite the [id] you used):
${knowledgeBlock}

Return STRICTLY a single JSON object (no prose, no markdown fences) with these fields:
{
  "hypothesis": "If we <change>, then <stage> drop-off will decrease because <reason from framework>",
  "framework": "hook" | "north_star" | "aarrr" | "lean_analytics" | "stripe_atlas" | "first_round",
  "code_sketch": "Concrete change. List the file(s) to touch and the pseudo-code. Be specific — an engineer should be able to start writing the PR from this.",
  "expected_impact_pct": 0.15,
  "ice": { "impact": 8, "confidence": 6, "ease": 7 },
  "cited_knowledge_ids": [3, 7]
}

Rules:
- expected_impact_pct is the fractional improvement you expect (0.15 = 15% reduction in the drop-off rate, not in absolute users).
- ice.impact, ice.confidence, ice.ease are integers 1..10.
- cited_knowledge_ids must be an array of the [id] numbers you actually used from the GROWTH KNOWLEDGE block (empty array if none applied).
- Pick the single framework that most directly justifies the experiment.
- Reply in English. JSON only.`;

  let raw: string;
  try {
    raw = (await llmGenerate(prompt)).trim();
  } catch (err) {
    console.error('[GrowthEngineer] LLM call failed:', err);
    return null;
  }

  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    console.warn('[GrowthEngineer] no JSON object in LLM output. Head:', raw.slice(0, 200));
    return null;
  }
  let parsed: RawProposal & { cited_knowledge_ids?: unknown; citedKnowledgeIds?: unknown };
  try {
    parsed = JSON.parse(objMatch[0]);
  } catch (err) {
    console.warn('[GrowthEngineer] JSON.parse failed:', err);
    return null;
  }

  const hypothesis = typeof parsed.hypothesis === 'string' ? parsed.hypothesis.trim() : '';
  const codeSketch = (
    (typeof parsed.codeSketch === 'string' && parsed.codeSketch) ||
    (typeof parsed.code_sketch === 'string' && parsed.code_sketch) ||
    ''
  ).trim();
  const expectedImpactPctRaw =
    (typeof parsed.expectedImpactPct === 'number' ? parsed.expectedImpactPct : undefined) ??
    (typeof parsed.expected_impact_pct === 'number' ? parsed.expected_impact_pct : undefined);
  const frameworkRaw = typeof parsed.framework === 'string' ? parsed.framework.toLowerCase().trim() : '';

  if (!hypothesis || !codeSketch || typeof expectedImpactPctRaw !== 'number') {
    console.warn('[GrowthEngineer] proposal missing required fields:', { hypothesis: !!hypothesis, codeSketch: !!codeSketch, expectedImpactPctRaw });
    return null;
  }

  const framework: GrowthFramework = (FRAMEWORK_LIST.includes(frameworkRaw as GrowthFramework)
    ? frameworkRaw
    : 'aarrr') as GrowthFramework;

  const clamp1to10 = (v: unknown): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 5;
    return Math.max(1, Math.min(10, Math.round(n)));
  };
  const impact = clamp1to10(parsed.ice?.impact);
  const confidence = clamp1to10(parsed.ice?.confidence);
  const ease = clamp1to10(parsed.ice?.ease);
  const iceScore = (impact * confidence * ease) / 10; // 0.1 .. 100

  const expectedImpactPct = Math.max(0, Math.min(1, expectedImpactPctRaw));

  // Normalise cited ids — accept either snake_case or camelCase, must be all
  // integers, must reference rows we actually surfaced to the LLM.
  const citedRaw =
    (Array.isArray(parsed.citedKnowledgeIds) && parsed.citedKnowledgeIds) ||
    (Array.isArray(parsed.cited_knowledge_ids) && parsed.cited_knowledge_ids) ||
    [];
  const validKnowledgeIds = new Set(knowledgeRows.map((r) => r.id));
  const citedKnowledgeIds: number[] = [];
  for (const v of citedRaw as unknown[]) {
    const n = Number(v);
    if (Number.isInteger(n) && validKnowledgeIds.has(n)) citedKnowledgeIds.push(n);
  }

  // Persist the proposal. baselineMetrics is a frozen snapshot so we can
  // compare against it in step 5 without needing to re-derive the same
  // window later (events outside the window will have moved on by then).
  const insertResult = await db
    .insert(maraGrowthExperiments)
    .values({
      dropOffStage: dropOff.stage,
      baselineDropOffRate: dropOff.dropOffRate,
      baselineMetrics: JSON.stringify(snapshot),
      hypothesis,
      framework,
      codeSketch,
      iceImpact: impact,
      iceConfidence: confidence,
      iceEase: ease,
      iceScore,
      expectedImpactPct,
      citedKnowledgeIds: JSON.stringify(citedKnowledgeIds),
      status: 'proposed',
    })
    .returning({ id: maraGrowthExperiments.id });

  const experimentId = insertResult[0]?.id;
  if (!experimentId) {
    console.error('[GrowthEngineer] insert returned no id');
    return null;
  }

  console.log(
    `[GrowthEngineer] 💡 Proposed experiment #${experimentId} on ${dropOff.stage} (ICE=${iceScore.toFixed(1)}, framework=${framework})`,
  );

  return {
    experimentId,
    hypothesis,
    framework,
    codeSketch,
    expectedImpactPct,
    ice: { impact, confidence, ease, score: iceScore },
    citedKnowledgeIds,
    dropOff,
  };
}

// === Step 5: Measure outcomes after 7 days ===

/**
 * Find every experiment whose `measure_after_at` has passed and that has not
 * been measured yet, then compute the current funnel and write back
 * actualImpactPct + a learning. Returns the list of just-measured experiments
 * (or status='still_waiting' for ones that exist but aren't due yet).
 *
 * We process at most `maxToMeasure` per cycle so a backlog never makes a
 * brain cycle exceed its phase timeout. The remaining ones are picked up on
 * subsequent cycles in chronological order.
 */
export async function measureExperimentOutcome(
  maxToMeasure = 3,
): Promise<MeasuredExperiment[]> {
  const now = Date.now();
  const due = await db
    .select()
    .from(maraGrowthExperiments)
    .where(
      and(
        eq(maraGrowthExperiments.status, 'implemented'),
        isNull(maraGrowthExperiments.measuredAt),
      ),
    )
    .orderBy(desc(maraGrowthExperiments.measureAfterAt))
    .limit(maxToMeasure * 4); // overscan, filter dueness in JS to avoid SQLite timestamp coercion quirks

  const results: MeasuredExperiment[] = [];
  for (const exp of due) {
    if (results.length >= maxToMeasure) break;
    const measureAfterMs = exp.measureAfterAt
      ? (exp.measureAfterAt instanceof Date
          ? exp.measureAfterAt.getTime()
          : Number(exp.measureAfterAt) || 0)
      : 0;
    if (!measureAfterMs || measureAfterMs > now) {
      results.push({ experimentId: exp.id, status: 'still_waiting' });
      continue;
    }

    // Baseline drop-off was frozen at proposal time. Compare against the
    // current funnel on the same drop-off stage.
    let baseline: FunnelSnapshot | null = null;
    try {
      baseline = JSON.parse(exp.baselineMetrics) as FunnelSnapshot;
    } catch {
      baseline = null;
    }
    if (!baseline) {
      await db
        .update(maraGrowthExperiments)
        .set({
          status: 'measured',
          measuredAt: new Date(),
          succeeded: 0,
          learnings: 'Could not measure: baseline metrics unparseable.',
        })
        .where(eq(maraGrowthExperiments.id, exp.id));
      results.push({ experimentId: exp.id, status: 'no_baseline' });
      continue;
    }

    const currentSnapshot = await readFunnelData(baseline.windowDays);
    const baselineStage = baseline.stages.find((s) => s.stage === exp.dropOffStage);
    const currentStage = currentSnapshot.stages.find((s) => s.stage === exp.dropOffStage);
    if (!baselineStage || !currentStage) {
      await db
        .update(maraGrowthExperiments)
        .set({
          status: 'measured',
          measuredAt: new Date(),
          succeeded: 0,
          learnings: 'Could not measure: stage missing in baseline or current snapshot.',
        })
        .where(eq(maraGrowthExperiments.id, exp.id));
      results.push({ experimentId: exp.id, status: 'no_baseline' });
      continue;
    }

    // actualImpactPct = relative reduction in drop-off rate at the same stage.
    // Positive = drop-off got smaller (good). Negative = drop-off got worse.
    const baselineRate = baselineStage.dropOffRateFromPrev;
    const currentRate = currentStage.dropOffRateFromPrev;
    const actualImpactPct = baselineRate > 0 ? (baselineRate - currentRate) / baselineRate : 0;
    const succeeded = actualImpactPct >= exp.expectedImpactPct * 0.6 ? 1 : 0; // hit at least 60% of expected
    const learnings = succeeded
      ? `${exp.framework} hypothesis confirmed on ${exp.dropOffStage}: drop-off ${(baselineRate * 100).toFixed(0)}% → ${(currentRate * 100).toFixed(0)}% (${(actualImpactPct * 100).toFixed(0)}% relative improvement vs ${(exp.expectedImpactPct * 100).toFixed(0)}% expected).`
      : `${exp.framework} hypothesis did NOT meet target on ${exp.dropOffStage}: drop-off ${(baselineRate * 100).toFixed(0)}% → ${(currentRate * 100).toFixed(0)}% (got ${(actualImpactPct * 100).toFixed(0)}% relative improvement vs ${(exp.expectedImpactPct * 100).toFixed(0)}% expected). Re-evaluate assumption.`;

    await db
      .update(maraGrowthExperiments)
      .set({
        status: 'measured',
        measuredAt: new Date(),
        resultMetrics: JSON.stringify(currentSnapshot),
        actualImpactPct,
        succeeded,
        learnings,
      })
      .where(eq(maraGrowthExperiments.id, exp.id));

    // Store the learning in the knowledge base so the next cycle's
    // proposeGrowthExperiment() can cite it. Confidence is high (90) because
    // it is grounded in observed platform data, not an LLM guess.
    await storeKnowledge(
      'platform_insight',
      `Growth experiment #${exp.id} — ${exp.dropOffStage} (${exp.framework})`,
      learnings,
      'self_reflection',
      90,
      {
        experimentId: exp.id,
        framework: exp.framework,
        stage: exp.dropOffStage,
        expectedImpactPct: exp.expectedImpactPct,
        actualImpactPct,
        succeeded: !!succeeded,
      },
    );

    results.push({
      experimentId: exp.id,
      status: 'measured',
      actualImpactPct,
      succeeded: !!succeeded,
      learnings,
    });
    console.log(
      `[GrowthEngineer] 📏 Measured experiment #${exp.id}: ${succeeded ? 'SUCCESS' : 'MISS'} (actual ${(actualImpactPct * 100).toFixed(0)}% vs ${(exp.expectedImpactPct * 100).toFixed(0)}%).`,
    );
  }

  return results;
}

// === Orchestrator ===

export interface GrowthCycleResult {
  funnel: FunnelSnapshot;
  dropOff: DropOffPoint | null;
  proposal: GrowthExperimentProposal | null;
  measured: MeasuredExperiment[];
  skipReason?: string;
}

/**
 * Run the full Growth Engineer cycle for ONE invocation:
 *   read funnel → identify drop-off → propose ONE experiment → measure due ones
 *
 * Designed to be wrapped by the brain cycle's withTimeout(). Each step is
 * defensive — a failure to propose does not block measurement of already-due
 * experiments, and vice versa.
 */
export async function runGrowthEngineerCycle(): Promise<GrowthCycleResult> {
  // Always do measurements first; they don't depend on a new proposal and the
  // learnings they generate will be visible to the next propose() call.
  let measured: MeasuredExperiment[] = [];
  try {
    measured = await measureExperimentOutcome();
  } catch (err) {
    console.error('[GrowthEngineer] measureExperimentOutcome failed:', err);
  }

  const funnel = await readFunnelData();

  // Skip the proposal step if the platform is too quiet to draw any
  // signal from. The brain logs the skip reason for transparency.
  if (!funnel.hasMeaningfulData) {
    return {
      funnel,
      dropOff: null,
      proposal: null,
      measured,
      skipReason: `Funnel has only ${funnel.totalSignups} signups in last ${funnel.windowDays} days — not enough signal to propose a meaningful experiment.`,
    };
  }

  // Don't pile up proposals — if there's already a proposed-but-undecided
  // experiment for the same drop-off stage, wait for the admin to act on it
  // before generating another. Keeps the admin queue manageable.
  const dropOff = identifyDropOffPoint(funnel);
  if (!dropOff) {
    return { funnel, dropOff: null, proposal: null, measured, skipReason: 'No drop-off identified.' };
  }

  const existingProposed = await db
    .select({ id: maraGrowthExperiments.id })
    .from(maraGrowthExperiments)
    .where(
      and(
        eq(maraGrowthExperiments.status, 'proposed'),
        eq(maraGrowthExperiments.dropOffStage, dropOff.stage),
      ),
    )
    .limit(1);
  if (existingProposed.length > 0) {
    return {
      funnel,
      dropOff,
      proposal: null,
      measured,
      skipReason: `Already have a pending proposed experiment for stage "${dropOff.stage}" (id=${existingProposed[0].id}). Waiting for admin decision.`,
    };
  }

  let proposal: GrowthExperimentProposal | null = null;
  try {
    proposal = await proposeGrowthExperiment(funnel, dropOff);
  } catch (err) {
    console.error('[GrowthEngineer] proposeGrowthExperiment failed:', err);
  }

  return { funnel, dropOff, proposal, measured };
}

// === Helpers used by admin endpoints ===

export async function listExperiments(filter?: {
  status?: 'proposed' | 'approved' | 'implemented' | 'measured' | 'rejected';
  limit?: number;
}): Promise<(typeof maraGrowthExperiments.$inferSelect)[]> {
  const limit = filter?.limit ?? 50;
  if (filter?.status) {
    return await db
      .select()
      .from(maraGrowthExperiments)
      .where(eq(maraGrowthExperiments.status, filter.status))
      .orderBy(desc(maraGrowthExperiments.createdAt))
      .limit(limit);
  }
  return await db
    .select()
    .from(maraGrowthExperiments)
    .orderBy(desc(maraGrowthExperiments.createdAt))
    .limit(limit);
}

export async function getExperiment(
  id: number,
): Promise<typeof maraGrowthExperiments.$inferSelect | null> {
  const rows = await db
    .select()
    .from(maraGrowthExperiments)
    .where(eq(maraGrowthExperiments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function decideExperiment(
  id: number,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  note?: string,
): Promise<typeof maraGrowthExperiments.$inferSelect | null> {
  const existing = await getExperiment(id);
  if (!existing) return null;
  if (existing.status !== 'proposed') {
    // Idempotent-friendly: surface the current row but don't re-write.
    return existing;
  }
  await db
    .update(maraGrowthExperiments)
    .set({
      status: decision,
      decidedBy,
      decidedAt: new Date(),
      decisionNote: note ?? null,
    })
    .where(eq(maraGrowthExperiments.id, id));
  return await getExperiment(id);
}

/**
 * Mark an approved experiment as implemented. Schedules the measurement for
 * 7 days from now (configurable via `measureAfterMs` for tests / fast cycles).
 */
export async function markImplemented(
  id: number,
  measureAfterMs = 7 * 24 * 60 * 60 * 1000,
): Promise<typeof maraGrowthExperiments.$inferSelect | null> {
  const existing = await getExperiment(id);
  if (!existing) return null;
  if (existing.status !== 'approved') return existing;
  const now = Date.now();
  await db
    .update(maraGrowthExperiments)
    .set({
      status: 'implemented',
      implementedAt: new Date(now),
      measureAfterAt: new Date(now + measureAfterMs),
    })
    .where(eq(maraGrowthExperiments.id, id));
  return await getExperiment(id);
}

// Silence the unused sql import warning when the file is built in isolation
// — `sql` is kept available for future raw-SQL helpers (e.g. windowed
// queries) without forcing another import in follow-up PRs.
void sql;
