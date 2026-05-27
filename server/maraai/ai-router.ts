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
import { db } from '../db.js';
import { aiRouteLog, type AiRoute } from '../../shared/schema.js';
import { tryLocalAI } from './local-ai.js';
import { getConsent } from './consent.js';
import { logActivity } from './activity.js';
import { publishEvent, KAFKA_TOPICS } from './kafka.js';

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

  // Step 2 — central AI (Anthropic or server-side Ollama).
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
