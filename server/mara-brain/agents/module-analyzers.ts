// Per-module autonomous growth analyzers.
//
// Each analyzer focuses on ONE module (You / Reels / Trading / Writers /
// Creators / VIP), gathers module-specific metrics, asks Claude for targeted
// insights + concrete growth proposals, and stores the proposals in
// `maraPlatformInsights` (status='proposed') for admin approval.
//
// Analyzers NEVER apply changes autonomously — they only propose. The admin
// dashboard surfaces proposals for review.
//
// Each analyzer costs at most 1 LLM call. The learning rate limiter gates
// all calls against the daily cap.

import { llmGenerate, isLLMConfigured } from '../../llm.js';
import { storage } from '../../storage.js';
import { storeKnowledge } from '../knowledge-base.js';
import { guardedLLMCall } from '../rate-limiter.js';

export type ModuleKey = 'you' | 'reels' | 'trading' | 'writers' | 'creators' | 'vip';

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

  const raw = await guardedLLMCall(`module-analyzer:${module}`, () => llmGenerate(prompt));
  if (raw === null) {
    return { module, proposalsCreated: 0, insightsStored: 0, skipped: true, reason: 'rate limit or circuit open' };
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
// Trading Academy
// ============================================================================
async function analyzeTrading(): Promise<ModuleAnalysisResult> {
  const users = await storage.getAllUsers();
  // We don't have a granular progress query; surface what we can.
  const metrics = [
    `- Total users: ${users.length}`,
    `- 5 levels exist: L1 Fundamentals (free), L2 Technical, L3 Strategies, L4 Advanced/Crypto (VIP), L5 Live (VIP+)`,
    `- Quizzes server-graded. Certificates auto-issued at 100% module completion.`,
    `- Known gap: no per-lesson dropout metric exposed yet.`,
  ].join('\n');

  return runAnalyzer(
    'trading',
    metrics,
    'Focus on: lesson-to-lesson completion funnel, quiz retry friction, VIP upsell placement between L3 and L4, missing topics for 2026 (DeFi, on-chain, macro). Propose specific new lessons or re-ordering.',
  );
}

// ============================================================================
// Writers
// ============================================================================
async function analyzeWriters(): Promise<ModuleAnalysisResult> {
  const pages = await storage.getPublishedWriterPages();
  const pub = pages.filter((p) => (p as { visibility?: string }).visibility === 'public').length;
  const vip = pages.filter((p) => (p as { visibility?: string }).visibility === 'vip').length;
  const paid = pages.filter((p) => (p as { visibility?: string }).visibility === 'paid').length;
  const authors = new Set(pages.map((p) => p.userId)).size;

  const metrics = [
    `- Total published pages: ${pages.length}`,
    `- Unique authors: ${authors}`,
    `- Visibility split — public: ${pub}, vip: ${vip}, paid: ${paid}`,
  ].join('\n');

  return runAnalyzer(
    'writers',
    metrics,
    'Focus on: topic gaps (what readers search but nobody writes), author retention (one-and-done authors), conversion of public readers into VIP/paid readers, featured-page surfacing. Propose concrete topic recommendations or UX nudges.',
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
  // Count VIP-ish users best-effort: users with Trading L4+ access are VIP.
  let vipCount = 0;
  for (const u of users) {
    try {
      const access = await storage.getUserTradingAccess(u.id);
      if (access?.hasAccess) vipCount += 1;
    } catch {
      // ignore
    }
  }
  const ratio = users.length ? ((vipCount / users.length) * 100).toFixed(1) : '0.0';

  const metrics = [
    `- Total users: ${users.length}`,
    `- VIP-tier users (by trading access signal): ${vipCount}`,
    `- VIP conversion ratio: ${ratio}%`,
    `- Gated features: Trading L4+/L5, VIP-only writer pages, higher tip limits`,
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
    { key: 'trading', fn: analyzeTrading },
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
