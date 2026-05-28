// Hybrid AI routing engine.
//
// Routing priority: Local → Central → Degrade.
//
//   * Local AI is always available — rule-based, no network, no consent.
//   * Central AI is the default workhorse (Anthropic Claude or server-side
//     Ollama). Used unless ANTHROPIC_API_KEY is unset, in which case we
//     degrade gracefully with a localized "catching my breath" message.
//   * P2P compute (browser background tasks) runs independently via the
//     p2p-tasks queue and never affects AI inference routing. Users do not
//     run LLM inference — they contribute CPU for lightweight JS tasks only.
//
// Every AI call ends with a row in `ai_route_log` so the user can audit
// which route handled their message.

import { getMaraResponse } from '../ai.js';
import { isLLMConfigured } from '../llm.js';
import { db, rawSqlite } from '../db.js';
import { aiRouteLog, type AiRoute } from '../../shared/schema.js';
import { tryLocalAI } from './local-ai.js';
import { getConsent } from './consent.js';
import { logActivity } from './activity.js';
import { publishEvent, KAFKA_TOPICS } from './kafka.js';
import { callAgent, isSupportAgentEnabled } from '../lib/anthropic-agents.js';
import { getUserMemories } from '../mara-brain/memory.js';

export type RouteDecision = {
  route: AiRoute;
  reason: string;
};

export type RouteResult = {
  response: string;
  detectedMood: string;
  route: AiRoute;
  reason: string;
  latencyMs: number;
  fallback: boolean;
};

export type RouteOptions = {
  userId?: string;
  module?: string;
  prefs?: { personality?: string; language?: string } | null;
  history?: { role: string; content: string }[];
};

const DEGRADE_RESPONSE = {
  response:
    "I am catching my breath — central AI is unavailable right now. Try again in a moment.",
  detectedMood: 'calm',
};

function buildSupportAgentContext(userId: string, lang?: string | null): string {
  const parts: string[] = [];

  try {
    const xp = rawSqlite.prepare('SELECT xp, level, streak FROM user_xp WHERE user_id = ? LIMIT 1').get(userId) as
      | { xp: number; level: number; streak: number }
      | undefined;
    if (xp) parts.push(`User stats: XP=${xp.xp}, Level=${xp.level}, Streak=${xp.streak} days`);

    const missions = rawSqlite
      .prepare(`SELECT m.title, um.status FROM user_missions um JOIN missions m ON m.id = um.mission_id WHERE um.user_id = ? AND um.status != 'completed' ORDER BY um.created_at DESC LIMIT 5`)
      .all(userId) as Array<{ title: string; status: string }>;
    if (missions.length > 0)
      parts.push(`Active missions: ${missions.map((m) => `"${m.title}" (${m.status})`).join(', ')}`);
  } catch {
    // non-fatal
  }

  const memories = getUserMemories(userId, 8);
  if (memories) parts.push(`What you know about this user:\n${memories}`);

  if (lang) parts.push(`Respond in language: ${lang}`);

  return parts.length > 0 ? `<user_context>\n${parts.join('\n')}\n</user_context>` : '';
}

/** Pick a route given system availability. */
export async function decideRoute(opts: {
  userId?: string;
  message: string;
  lang?: string | null;
}): Promise<RouteDecision> {
  const local = tryLocalAI(opts.message, opts.lang ?? null);
  if (local && local.confidence >= 0.7) {
    return { route: 'local', reason: 'local-confident' };
  }

  if (isLLMConfigured()) {
    return { route: 'central', reason: 'central-llm-ok' };
  }

  if (local) {
    return { route: 'local', reason: 'central-unconfigured-local-fallback' };
  }

  return { route: 'central', reason: 'central-unconfigured-degrade' };
}

/** Execute a chat call and emit a route-log row + kafka event. */
export async function route(message: string, opts: RouteOptions = {}): Promise<RouteResult> {
  const start = Date.now();
  const lang = opts.prefs?.language || null;

  // Step 1 — local AI. Instant, no network, no consent needed.
  const local = tryLocalAI(message, lang);
  if (local && local.confidence >= 0.7) {
    return finish('local', false, 'local-confident', start, local.response, local.detectedMood, opts);
  }

  // Step 2a — Mara Support Agent (managed agent with tools + rich context).
  if (opts.userId && isSupportAgentEnabled()) {
    try {
      const agentId = process.env.MARA_SUPPORT_AGENT_ID!;
      const systemExtra = buildSupportAgentContext(opts.userId, opts.prefs?.language);
      const agentMessages = (opts.history ?? [])
        .slice(-10)
        .filter((h) => h.role === 'user' || h.role === 'assistant')
        .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }));
      agentMessages.push({ role: 'user', content: message });

      const response = await callAgent(agentId, agentMessages, { systemExtra, maxTokens: 1024 });
      if (response.trim()) {
        return finish('central', false, 'support-agent', start, response, 'neutral', opts);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logActivity(opts.userId ?? null, 'ai.error', { route: 'central', error: `support-agent: ${msg}` });
    }
  }

  // Step 2b — central AI (Anthropic or server-side Ollama).
  if (isLLMConfigured()) {
    try {
      const r = await getMaraResponse(
        message,
        opts.history ?? [],
        opts.prefs ?? null,
        opts.module,
        opts.userId,
      );
      return finish('central', false, 'central-llm-ok', start, r.response, r.detectedMood, opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logActivity(opts.userId ?? null, 'ai.error', { route: 'central', error: msg });
    }
  }

  // Step 3 — degrade gracefully.
  const degraded = local ?? DEGRADE_RESPONSE;
  return finish(
    'local',
    true,
    'central-unavailable-degrade',
    start,
    degraded.response,
    degraded.detectedMood,
    opts,
  );
}

async function finish(
  routeName: AiRoute,
  fallback: boolean,
  reason: string,
  startedAt: number,
  response: string,
  detectedMood: string,
  opts: RouteOptions,
): Promise<RouteResult> {
  const latencyMs = Date.now() - startedAt;

  // Persist a route-log row. Best-effort: never let this fail the request.
  try {
    await db.insert(aiRouteLog).values({
      userId: opts.userId ?? null,
      route: routeName,
      module: opts.module ?? null,
      latencyMs,
      tokensIn: 0,
      tokensOut: estimateTokens(response),
      success: 1,
      error: null,
    });
  } catch (err) {
    console.error('[maraai/ai-router] route-log insert failed:', err);
  }

  await logActivity(opts.userId ?? null, 'ai.route', {
    route: routeName,
    fallback,
    reason,
    latencyMs,
    module: opts.module ?? null,
  });

  await publishEvent(
    KAFKA_TOPICS.AI_CHAT,
    {
      userId: opts.userId ?? null,
      route: routeName,
      module: opts.module ?? null,
      latencyMs,
    },
    { userId: opts.userId ?? null },
  );

  return { response, detectedMood, route: routeName, reason, latencyMs, fallback };
}

function estimateTokens(s: string): number {
  // Cheap upper bound: ~4 chars / token. Used only for transparency stats.
  return Math.max(1, Math.ceil(s.length / 4));
}
