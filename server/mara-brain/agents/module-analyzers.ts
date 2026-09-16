// Per-module autonomous growth analyzers.
//
// Each analyzer focuses on ONE module (You / Reels / Missions / Writers /
// Creators / VIP), gathers module-specific metrics, asks Claude for targeted
// insights + concrete growth proposals, and stores the proposals in
// `maraPlatformInsights` (status='proposed') for admin approval.
//
// Analyzers NEVER apply changes autonomously — they only propose. The admin
// dashboard surfaces proposals for review.
//
// Each analyzer costs at most 1 LLM call. The learning rate limiter gates
// all calls against the daily cap.

import { llmGenerate, isLLMConfigured, LLMRateLimitedError } from '../../llm.js';
import { storage } from '../../storage.js';
import { storeKnowledge } from '../knowledge-base.js';
import { rawSqlite } from '../../db.js';

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

async function runAnalyzer(
  module: ModuleKey,
  metricsBlock: string,
  focusPrompt: string,
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
  if (Array.isArray(parsed.proposals)) {
    for (const p of parsed.proposals) {
      if (!isValidProposal(p)) continue;
      try {
        await storage.createPlatformInsight({
          module,
          insightType: p.insightType || 'improvement',
          title: p.title.slice(0, 200),
          description: p.description.slice(0, 2000),
          priority: p.priority,
          estimatedImpact: p.impact,
          source: 'self_analysis',
        });
        proposalsCreated += 1;
      } catch (err) {
        console.error(`[ModuleAnalyzer:${module}] Failed to store proposal:`, err);
      }
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
// Reels (short video feed)
// ============================================================================
async function analyzeReels(): Promise<ModuleAnalysisResult> {
  const videos = await storage.getVideos();
  const reels = videos.filter((v) => v.type === 'reel' || v.type === 'reels');
  const totalLikes = reels.reduce((sum, v) => sum + (v.likes || 0), 0);
  const totalViews = reels.reduce((sum, v) => sum + (v.views || 0), 0);
  const totalShares = reels.reduce((sum, v) => sum + (v.shares || 0), 0);
  const avgLikes = reels.length ? (totalLikes / reels.length).toFixed(2) : '0';
  const avgViews = reels.length ? (totalViews / reels.length).toFixed(2) : '0';
  const pending = reels.filter((v) => v.moderationStatus === 'pending').length;

  const metrics = [
    `- Total reels: ${reels.length}`,
    `- Total likes / views / shares: ${totalLikes} / ${totalViews} / ${totalShares}`,
    `- Avg likes per reel: ${avgLikes}`,
    `- Avg views per reel: ${avgViews}`,
    `- Pending moderation: ${pending}`,
    `- Current ranking formula: likes×3 + views + shares×5 (time-decayed)`,
  ].join('\n');

  return runAnalyzer(
    'reels',
    metrics,
    'Focus on: ranking formula weights, completion-rate signals (currently missing), session length per user, cold-start for brand-new reels. Propose concrete formula adjustments with specific weights.',
  );
}

// ============================================================================
// Growth (funnel + acquisition + conversion)
// ============================================================================
async function analyzeGrowth(): Promise<ModuleAnalysisResult> {
  const users = await storage.getAllUsers();
  const allVideos = await storage.getVideos();
  const creatorVideos = allVideos.filter((v) => v.type === 'creator');
  const reels = allVideos.filter((v) => v.type === 'reel' || v.type === 'reels');

  const metrics = [
    `- Total registered users: ${users.length}`,
    `- Users with content (creators + reels): ${new Set([...creatorVideos, ...reels].map((v) => v.creatorId).filter(Boolean)).size}`,
    `- Total creator videos: ${creatorVideos.length}`,
    `- Total reels: ${reels.length}`,
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
