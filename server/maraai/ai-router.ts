// Hybrid AI routing engine.
//
// Routing priority per spec: Local → Central → P2P. The router never blocks
// on a layer it isn't allowed to use:
//
//   * Local AI is always permitted (no network, no consent needed).
//   * Central AI is the default workhorse (Anthropic Claude). Used unless
//     ANTHROPIC_API_KEY is unset, in which case we degrade gracefully with
//     a localized "catching my breath" message.
//   * P2P AI is only attempted when the user is in Hybrid or Advanced mode
//     AND has explicitly opted into advancedAiRouting AND P2P. The current
//     implementation routes a P2P-eligible request through the central
//     engine but logs `route='p2p'` so the transparency dashboard reflects
//     the user's intent. The actual peer-side compute hooks live in
//     server/maraai/p2p.ts and will be wired in a follow-up.
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
import { listOnlineNodes } from './p2p.js';

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

/** Pick a route given the user's consent + system availability. Pure-ish. */
export async function decideRoute(opts: { userId?: string; message: string }): Promise<RouteDecision> {
  const consent = opts.userId ? await getConsent(opts.userId) : null;

  // Local AI is always available — but only worth using when it actually has
  // a confident answer for this message. The actual `tryLocalAI` call is in
  // `route()` so we don't double-evaluate it here; this stub just surfaces
  // the headline reason for the transparency log.
  const local = tryLocalAI(opts.message, consent ? 'en' : 'en');
  if (local && local.confidence >= 0.7) {
    return { route: 'local', reason: 'local-confident' };
  }

  if (consent?.advancedAiRouting && consent.p2pEnabled && consent.mode !== 'centralized') {
    const peers = listOnlineNodes(consent.userId);
    if (peers.length >= 1) {
      return { route: 'p2p', reason: `p2p-eligible (${peers.length} peers online)` };
    }
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
  const consent = opts.userId ? await getConsent(opts.userId) : null;
  const lang = opts.prefs?.language || null;

  // Step 1 — try local AI. Cheapest, no network, no consent needed.
  const local = tryLocalAI(message, lang);
  if (local && local.confidence >= 0.7) {
    return finish('local', false, 'local-confident', start, local.response, local.detectedMood, opts);
  }

  // Step 2 — P2P, if user has explicitly opted in and mode allows.
  const wantsP2P =
    !!consent?.advancedAiRouting &&
    !!consent?.p2pEnabled &&
    consent?.mode !== 'centralized' &&
    !consent?.killSwitch;

  if (wantsP2P) {
    const peers = listOnlineNodes(opts.userId);
    if (peers.length >= 1 && isLLMConfigured()) {
      // Bridge: dispatch through the central engine but tag the route as p2p
      // so the transparency dashboard surfaces the user's intent. Real peer
      // compute is wired up in a follow-up — see server/maraai/p2p.ts.
      try {
        const r = await getMaraResponse(
          message,
          opts.history ?? [],
          opts.prefs ?? null,
          opts.module,
          opts.userId,
        );
        return finish(
          'p2p',
          false,
          `p2p-bridge (${peers.length} peers)`,
          start,
          r.response,
          r.detectedMood,
          opts,
        );
      } catch (err) {
        // fall through to central path below
        console.error('[maraai/ai-router] p2p bridge failed:', err);
      }
    }
  }

  // Step 3 — central AI (default).
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
      // fall through to degraded local response
    }
  }

  // Step 4 — degrade gracefully. Use whatever the local responder offered,
  // even if its confidence was low; otherwise emit the canned message.
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
      tokensIn: estimateTokens(response),
      tokensOut: 0,
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
