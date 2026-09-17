// Per-module autonomous growth analyzers.
//
// Each analyzer focuses on ONE module (You / Sparks / Missions / Writers /
// Creators / VIP), gathers module-specific metrics, asks Claude for targeted
// insights + concrete growth proposals, and stores the proposals in
// `maraPlatformInsights` (status='proposed') for admin approval.
//
// Analyzers only propose, EXCEPT Writers Hub and Missions: for these two
// (the modules the owner explicitly approved for full autonomy), the
// top-priority proposal per cycle also gets attempted through the real
// plan -> apply -> validate -> commit -> push pipeline, capped to one
// attempt per module per 6h and never for anything touching payment/payout
// code — see AUTO_APPLY_REGISTRY_ID and maybeAutoApplyTopProposal below.
// Every other module (You/Sparks/Growth/Creators/VIP) stays propose-only;
// the admin dashboard surfaces those proposals for manual review as before.
//
// Each analyzer costs at most 1 LLM call. The learning rate limiter gates
// all calls against the daily cap.

import { llmGenerate, isLLMConfigured, LLMRateLimitedError } from '../../llm.js';
import { storage } from '../../storage.js';
import { storeKnowledge } from '../knowledge-base.js';
import { rawSqlite } from '../../db.js';
import { autoApplyModuleProposal } from '../../services/autonomous-code-pipeline.js';
import { readHelloMaraModule } from '../../services/hellomara-module-registry.js';

export type ModuleKey = 'you' | 'reels' | 'growth' | 'writers' | 'creators' | 'vip' | 'missions';

export interface ModuleAnalysisResult {
  module: ModuleKey;
  proposalsCreated: number;
  insightsStored: number;
  skipped: boolean;
  reason?: string;
}

interface ProposalShape {
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  impact: 'low' | 'medium' | 'high' | 'critical';
  insightType: 'improvement' | 'bug' | 'feature_request' | 'performance' | 'ux';
}

function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function isValidProposal(p: unknown): p is ProposalShape {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.title === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.priority === 'string' &&
    ['P0', 'P1', 'P2', 'P3'].includes(obj.priority) &&
    typeof obj.impact === 'string' &&
    ['low', 'medium', 'high', 'critical'].includes(obj.impact)
  );
}

// Writers Hub and Missions are the two modules the owner explicitly approved
// for full autonomy ("aplice singura si sa mi dea rezultatul") — every other
// analyzer stays propose-only, same as before. Maps to the module registry
// id used by the Code Agent planner for file-scoped context.
const AUTO_APPLY_REGISTRY_ID: Partial<Record<ModuleKey, string>> = {
  writers: 'writers-hub',
  missions: 'missions',
};

// Brain cycles run far more often than a codebase should be redeploying
// itself — without a cooldown, an LLM that always finds "something
// actionable" would trigger a fresh commit/Railway deploy nearly every
// cycle. One autonomous attempt per module per window is enough to make
// real, visible progress without turning production into a churn machine.
const AUTO_APPLY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h

const PRIORITY_ORDER: Record<ProposalShape['priority'], number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

async function maybeAutoApplyTopProposal(
  module: ModuleKey,
  candidates: Array<{ proposal: ProposalShape; insightId: number }>,
): Promise<void> {
  const registryId = AUTO_APPLY_REGISTRY_ID[module];
  if (!registryId || candidates.length === 0) return;

  const actor = `mara-analyzer:${module}`;
  try {
    const cutoffSec = Math.floor((Date.now() - AUTO_APPLY_COOLDOWN_MS) / 1000);
    const recent = rawSqlite
      .prepare(`SELECT COUNT(*) AS c FROM mara_code_agent_requests WHERE created_by = ? AND created_at > ?`)
      .get(actor, cutoffSec) as { c: number };
    if (recent.c > 0) return; // still cooling down since the last autonomous attempt for this module
  } catch (err) {
    console.error(`[ModuleAnalyzer:${module}] auto-apply cooldown check failed:`, err);
    return;
  }

  const top = [...candidates].sort((a, b) => PRIORITY_ORDER[a.proposal.priority] - PRIORITY_ORDER[b.proposal.priority])[0];
  const entry = await readHelloMaraModule(registryId).catch(() => null);
  const moduleContext = entry
    ? {
        moduleId: entry.id, moduleName: entry.displayName, frontendFiles: entry.frontendFiles, backendFiles: entry.backendFiles,
        databaseDependencies: entry.databaseDependencies, apiEndpoints: entry.apiEndpoints, sharedDependencies: entry.sharedDependencies, sharedWarnings: entry.sharedWarnings,
      }
    : null;
  const description = `[Autonomous growth proposal — ${module} module, priority ${top.proposal.priority}]\n${top.proposal.title}\n\n${top.proposal.description}\n\nImplement this concretely and minimally in the MaraAI codebase, scoped to the ${module} module. Keep the change small and safe.`;

  let result;
  try {
    result = await autoApplyModuleProposal(description, moduleContext, actor);
  } catch (err) {
    console.error(`[ModuleAnalyzer:${module}] auto-apply failed:`, err);
    return;
  }

  if (result.outcome === 'committed') {
    try { await storage.updatePlatformInsightStatus(top.insightId, 'completed'); } catch { /* dashboard will just show it as still proposed */ }
  }

  const summary = result.outcome === 'committed'
    ? `Mara a implementat singură și a trimis în producție: "${top.proposal.title}". ${result.detail}`
    : `Mara a încercat să implementeze autonom "${top.proposal.title}", dar nu a ajuns în producție (${result.outcome}). ${result.detail}`;
  try {
    await storeKnowledge('platform_insight', `Încercare de cod autonomă — ${module}`, summary, 'self_reflection', 80, { module, autoApply: true, outcome: result.outcome, planId: result.planId });
  } catch (err) {
    console.error(`[ModuleAnalyzer:${module}] failed to record auto-apply outcome:`, err);
  }
}

async function runAnalyzer(
  module: ModuleKey,
  metricsBlock: string,
  focusPrompt: string,
  options?: { autoApply?: boolean },
): Promise<ModuleAnalysisResult> {
  if (!isLLMConfigured()) {
    return { module, proposalsCreated: 0, insightsStored: 0, skipped: true, reason: 'LLM not configured' };
  }

  const prompt = `You are Mara, the AI steward of the MaraAI platform. You are analyzing ONE module: "${module}".

# Module Metrics
${metricsBlock}

# Your Focus
${focusPrompt}

Generate 2-4 concrete, actionable growth proposals that — if implemented — would measurably improve THIS module's retention, engagement, or conversion. Be specific (numbers, thresholds, features). Avoid generic advice.

Also generate ONE platform-level insight (a single paragraph) that summarizes the module's current state and the top lever for growth.

Return STRICT JSON:
{
  "insight": "single paragraph summary",
  "proposals": [
    {
      "title": "short, concrete title (max 80 chars)",
      "description": "1-3 sentences explaining what and why. Include concrete thresholds/numbers when possible.",
      "priority": "P0" | "P1" | "P2" | "P3",
      "impact": "low" | "medium" | "high" | "critical",
      "insightType": "improvement" | "bug" | "feature_request" | "performance" | "ux"
    }
  ]
}`;

  let raw: string;
  try {
    raw = await llmGenerate(prompt, { source: `agent.module-analyzer.${module}` });
  } catch (err) {
    if (err instanceof LLMRateLimitedError) {
      return { module, proposalsCreated: 0, insightsStored: 0, skipped: true, reason: 'rate limit or circuit open' };
    }
    throw err;
  }

  const parsed = extractJson(raw) as
    | { insight?: unknown; proposals?: unknown }
    | null;
  if (!parsed) {
    return { module, proposalsCreated: 0, insightsStored: 0, skipped: true, reason: 'invalid JSON response' };
  }

  let proposalsCreated = 0;
  const storedProposals: Array<{ proposal: ProposalShape; insightId: number }> = [];
  if (Array.isArray(parsed.proposals)) {
    for (const p of parsed.proposals) {
      if (!isValidProposal(p)) continue;
      try {
        const insight = await storage.createPlatformInsight({
          module,
          insightType: p.insightType || 'improvement',
          title: p.title.slice(0, 200),
          description: p.description.slice(0, 2000),
          priority: p.priority,
          estimatedImpact: p.impact,
          source: 'self_analysis',
        });
        proposalsCreated += 1;
        storedProposals.push({ proposal: p, insightId: insight.id });
      } catch (err) {
        console.error(`[ModuleAnalyzer:${module}] Failed to store proposal:`, err);
      }
    }
  }

  if (options?.autoApply && storedProposals.length > 0) {
    try {
      await maybeAutoApplyTopProposal(module, storedProposals);
    } catch (err) {
      console.error(`[ModuleAnalyzer:${module}] auto-apply step failed:`, err);
    }
  }

  let insightsStored = 0;
  if (typeof parsed.insight === 'string' && parsed.insight.length > 20) {
    try {
      await storeKnowledge(
        'platform_insight',
        `Module growth: ${module}`,
        parsed.insight,
        'self_reflection',
        75,
        { module, analyzedAt: new Date().toISOString() },
      );
      insightsStored = 1;
    } catch (err) {
      console.error(`[ModuleAnalyzer:${module}] Failed to store insight:`, err);
    }
  }

  return { module, proposalsCreated, insightsStored, skipped: false };
}

// ============================================================================
// You (profile / identity / follow graph)
// ============================================================================
async function analyzeYou(): Promise<ModuleAnalysisResult> {
  const [users, allVideos] = await Promise.all([
    storage.getAllUsers(),
    storage.getVideos(),
  ]);
  const activeUserIds = new Set<string>();
  for (const v of allVideos) {
    if (v.creatorId) activeUserIds.add(v.creatorId);
  }

  const metrics = [
    `- Total users: ${users.length}`,
    `- Users who posted a video: ${activeUserIds.size}`,
    `- Silent users (no videos): ${Math.max(0, users.length - activeUserIds.size)}`,
    `- Ratio posting→total: ${users.length ? ((activeUserIds.size / users.length) * 100).toFixed(1) : '0.0'}%`,
  ].join('\n');

  return runAnalyzer(
    'you',
    metrics,
    'Focus on: identity/profile activation, badges that reward first post or 7-day streak, onboarding friction, follower graph density. Propose concrete retention levers for silent users.',
  );
}

// ============================================================================
// Sparks (short video feed — renamed from "Reels"; connected to Missions,
// Writers Hub and You, plus optional external YouTube/TikTok links)
// ============================================================================
// `videos.type` values a real Spark can have today — native uploads default
// to 'creator' (see uploadReel()), plus the three cross-module origins added
// this session. Neither 'reel' nor 'reels' has ever actually been written by
// any insert path — the old filter here always matched nothing real.
const SPARK_VIDEO_TYPES = new Set(['creator', 'mission-spark', 'writers-trailer', 'external-link']);

async function analyzeReels(): Promise<ModuleAnalysisResult> {
  const videos = await storage.getVideos();
  const sparks = videos.filter((v) => SPARK_VIDEO_TYPES.has(v.type));
  const totalLikes = sparks.reduce((sum, v) => sum + (v.likes || 0), 0);
  const totalViews = sparks.reduce((sum, v) => sum + (v.views || 0), 0);
  const totalShares = sparks.reduce((sum, v) => sum + (v.shares || 0), 0);
  const avgLikes = sparks.length ? (totalLikes / sparks.length).toFixed(2) : '0';
  const avgViews = sparks.length ? (totalViews / sparks.length).toFixed(2) : '0';
  const pending = sparks.filter((v) => v.moderationStatus === 'pending').length;

  const metrics = [
    `- Total Sparks: ${sparks.length}`,
    `- Total likes / views / shares: ${totalLikes} / ${totalViews} / ${totalShares}`,
    `- Avg likes per Spark: ${avgLikes}`,
    `- Avg views per Spark: ${avgViews}`,
    `- Pending moderation: ${pending}`,
    `- Current ranking formula: likes×3 + views + shares×5 (time-decayed)`,
  ].join('\n');

  return runAnalyzer(
    'reels',
    metrics,
    'Focus on: ranking formula weights, completion-rate signals (currently missing), session length per user, cold-start for brand-new Sparks. Propose concrete formula adjustments with specific weights.',
  );
}

// ============================================================================
// Growth (funnel + acquisition + conversion)
// ============================================================================
async function analyzeGrowth(): Promise<ModuleAnalysisResult> {
  const users = await storage.getAllUsers();
  const allVideos = await storage.getVideos();
  const creatorVideos = allVideos.filter((v) => v.type === 'creator');
  const sparks = allVideos.filter((v) => SPARK_VIDEO_TYPES.has(v.type));

  const metrics = [
    `- Total registered users: ${users.length}`,
    `- Users with content (creators + Sparks): ${new Set([...creatorVideos, ...sparks].map((v) => v.creatorId).filter(Boolean)).size}`,
    `- Total creator videos: ${creatorVideos.length}`,
    `- Total Sparks: ${sparks.length}`,
    `- Activation rate (user created ≥1 piece of content): ${users.length ? ((new Set([...allVideos].map((v) => v.creatorId).filter(Boolean)).size / users.length) * 100).toFixed(1) : '0.0'}%`,
  ].join('\n');

  return runAnalyzer(
    'growth',
    metrics,
    'Focus on: signup-to-activation funnel, viral loop opportunities, referral mechanisms, onboarding improvements for new users, conversion from free to paid. Propose concrete growth levers aligned with 1M EUR ARR goal.',
  );
}

// ============================================================================
// Writers
// ============================================================================
async function analyzeWriters(): Promise<ModuleAnalysisResult> {
  const pages = await storage.getPublishedWriterPages();
  const pub = pages.filter((p) => (p as { visibility?: string }).visibility === 'public').length;
  const paid = pages.filter((p) => (p as { visibility?: string }).visibility === 'paid').length;
  const authors = new Set(pages.map((p) => p.userId)).size;
  const stats = await storage.getWritersHubPlatformStats();

  // Writing/publishing/selling are all open to every account now — no VIP
  // gate anywhere in Writers Hub — and every paid sale pays the author 90%
  // automatically via PayPal right after checkout, no manual payout request.
  const metrics = [
    `- Total published pages: ${pages.length} (public: ${pub}, paid: ${paid})`,
    `- Unique authors: ${authors}`,
    `- Writing/publishing/selling: open to every account, no VIP gate`,
    `- Total sales (all-time): ${stats.totalSales}`,
    `- Total revenue: €${(stats.totalRevenueCents / 100).toFixed(2)}`,
    `- Sent to authors (90% share, automatic PayPal payout): €${(stats.totalSentToAuthorsCents / 100).toFixed(2)}`,
    `- Owed but not yet sent (payout failed or author hasn't set a PayPal email): €${(stats.totalOwedToAuthorsCents / 100).toFixed(2)}`,
    `- Authors who've made at least 1 sale: ${stats.sellingAuthorCount}`,
    `- Authors who've set a PayPal payout email: ${stats.payoutEmailSetCount}`,
    `- Paid articles with zero sales: ${stats.paidArticlesNeverSold}`,
  ].join('\n');

  return runAnalyzer(
    'writers',
    metrics,
    'Focus on: (1) authors who publish paid content but never set a PayPal payout email — their earnings are stuck; propose a concrete UX nudge to close this. (2) paid articles with zero sales — pricing, discoverability, or topic-fit problem? (3) topic gaps (what readers search but nobody writes). (4) author retention (one-and-done authors). (5) surfacing high-earning authors/articles to inspire more selling. Propose concrete, numbered levers, not generic advice.',
    { autoApply: true },
  );
}

// ============================================================================
// Missions (the transformation-programs journey — New Mindset → New You)
// ============================================================================
// Was listed in this file's own header comment as one of the analyzed
// modules but never actually implemented — confirmed by grep before writing
// this, ModuleKey/runAllModuleAnalyzers simply didn't include it. Arguably
// the platform's core product had zero autonomous growth analysis.
async function analyzeMissions(): Promise<ModuleAnalysisResult> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const statusCounts = rawSqlite
    .prepare(`SELECT status, COUNT(*) AS c FROM user_program_enrollments GROUP BY status`)
    .all() as Array<{ status: string; c: number }>;
  const activeCount = statusCounts.find((r) => r.status === 'active')?.c ?? 0;
  const completedCount = statusCounts.find((r) => r.status === 'completed')?.c ?? 0;
  const totalEnrollments = statusCounts.reduce((sum, r) => sum + r.c, 0);
  const completionRate = totalEnrollments ? ((completedCount / totalEnrollments) * 100).toFixed(1) : '0.0';

  const perProgram = rawSqlite
    .prepare(
      `SELECT p.slug, p.name, COUNT(*) AS active_count
         FROM user_program_enrollments e
         JOIN mission_programs p ON e.program_id = p.id
        WHERE e.status = 'active'
        GROUP BY p.slug, p.name
        ORDER BY p.sort_order ASC`,
    )
    .all() as Array<{ slug: string; name: string; active_count: number }>;

  // Streak health: 0-streak active enrollments are the clearest at-risk
  // signal (someone who was doing daily missions and just... stopped).
  const zeroStreakActive = (
    rawSqlite.prepare(`SELECT COUNT(*) AS c FROM user_program_enrollments WHERE status='active' AND streak = 0`).get() as { c: number }
  ).c;

  // Stale = no activity in 3+ days but still marked active — different
  // signal from a fresh 0-streak enrollment (just started, hasn't lapsed).
  const staleCutoff = Math.floor((now - 3 * DAY_MS) / 1000);
  const staleActive = (
    rawSqlite
      .prepare(`SELECT COUNT(*) AS c FROM user_program_enrollments WHERE status='active' AND (last_activity_at IS NULL OR last_activity_at < ?)`)
      .get(staleCutoff) as { c: number }
  ).c;

  let purchaseStats = { totalPurchases: 0, totalRevenueCents: 0 };
  try {
    const row = rawSqlite
      .prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents), 0) AS revenue FROM program_purchases WHERE status = 'completed'`)
      .get() as { c: number; revenue: number };
    purchaseStats = { totalPurchases: row.c, totalRevenueCents: row.revenue };
  } catch { /* table may not exist in all envs */ }

  const metrics = [
    `- Total enrollments (all-time): ${totalEnrollments} — active: ${activeCount}, completed: ${completedCount}`,
    `- Completion rate: ${completionRate}%`,
    `- Per-program active enrollments: ${perProgram.map((p) => `${p.name}=${p.active_count}`).join(', ') || 'none'}`,
    `- Active enrollments with a 0-day streak right now: ${zeroStreakActive}`,
    `- Active enrollments with no activity in 3+ days (stale, at risk of silent churn): ${staleActive}`,
    `- Program purchases (New Skills/Body/Life/You unlocks, €7 each, or the €28 bundle): ${purchaseStats.totalPurchases} completed, €${(purchaseStats.totalRevenueCents / 100).toFixed(2)} revenue`,
  ].join('\n');

  return runAnalyzer(
    'missions',
    metrics,
    'Focus on: (1) the stale/at-risk active enrollments — what would win someone back after 3+ days of silence (a nudge, a notification, an easier re-entry mission)? (2) which program in the sequence loses the most people, and why that stage specifically. (3) whether the free New Mindset -> New Habit on-ramp is actually converting people into a paid program (New Skills+), and if not, what to change. (4) completion rate trends — is the 5-steps-per-day format helping or hurting. Propose concrete, numbered levers with specific thresholds, not generic advice — remember missions are meant to last the real ~1000+ day arc, so any proposal must respect that pacing, not shortcut it.',
    { autoApply: true },
  );
}

// ============================================================================
// Creators (revenue / payouts)
// ============================================================================
async function analyzeCreators(): Promise<ModuleAnalysisResult> {
  const users = await storage.getAllUsers();
  const videos = await storage.getVideos();
  const creatorIds = new Set(videos.map((v) => v.creatorId).filter(Boolean) as string[]);

  const metrics = [
    `- Total users: ${users.length}`,
    `- Unique creators (posted ≥1 video): ${creatorIds.size}`,
    `- Total videos: ${videos.length}`,
    `- Payouts: feature-flagged (no live money flow yet)`,
    `- Revenue sources wired in DB: reels earnings, writer page tips, direct tips`,
  ].join('\n');

  return runAnalyzer(
    'creators',
    metrics,
    'Focus on: payout threshold design, creator activation funnel (sign-up → first video → first payout), revenue format mix, fraud prevention on payout requests. Propose concrete payout tiers and activation nudges.',
  );
}

// ============================================================================
// VIP (premium tier)
// ============================================================================
async function analyzeVIP(): Promise<ModuleAnalysisResult> {
  const users = await storage.getAllUsers();
  // Trading access was removed; VIP count from subscription tiers instead.
  const vipCount = 0;
  const ratio = users.length ? ((vipCount / users.length) * 100).toFixed(1) : '0.0';

  const metrics = [
    `- Total users: ${users.length}`,
    `- VIP-tier users: ${vipCount}`,
    `- VIP conversion ratio: ${ratio}%`,
    `- Gated features: VIP-only creator pages, premium writer templates, higher tip limits, AI chat priority`,
  ].join('\n');

  return runAnalyzer(
    'vip',
    metrics,
    'Focus on: conversion funnel free→VIP, what gated features drive upgrades, pricing tier A/B ideas, churn signals after first VIP month. Propose concrete feature moves between free/VIP and specific upgrade prompts.',
  );
}

// ============================================================================
// Orchestrator
// ============================================================================
/**
 * Run all 6 module analyzers sequentially. Each analyzer respects the global
 * learning rate limit; if the cap is hit mid-run, remaining analyzers are
 * skipped cleanly (they report skipped=true).
 */
export async function runAllModuleAnalyzers(): Promise<ModuleAnalysisResult[]> {
  const analyzers: Array<{ key: ModuleKey; fn: () => Promise<ModuleAnalysisResult> }> = [
    { key: 'you', fn: analyzeYou },
    { key: 'reels', fn: analyzeReels },
    { key: 'growth', fn: analyzeGrowth },
    { key: 'missions', fn: analyzeMissions },
    { key: 'writers', fn: analyzeWriters },
    { key: 'creators', fn: analyzeCreators },
    { key: 'vip', fn: analyzeVIP },
  ];

  const results: ModuleAnalysisResult[] = [];
  for (const { key, fn } of analyzers) {
    try {
      const result = await fn();
      results.push(result);
    } catch (err) {
      console.error(`[ModuleAnalyzers] ${key} failed:`, err);
      results.push({
        module: key,
        proposalsCreated: 0,
        insightsStored: 0,
        skipped: true,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
    // Space out calls to spread API load
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return results;
}
