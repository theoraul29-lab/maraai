/**
 * LLM Abstraction Layer.
 *
 * Historically this file talked directly to the Anthropic SDK. Today it is a
 * thin wrapper around `server/lib/provider-router.ts`, which routes between
 * Ollama (primary, self-hosted, free) and Anthropic (paid fallback). The
 * exported function signatures (`llmChat`, `llmGenerate`, `isLLMConfigured`,
 * `getActiveProvider`, `checkAnthropicHealth`, `LLMMessage`, `LLMProvider`)
 * are preserved verbatim so the ~12 call sites in `server/`, `server/mara-brain/`,
 * `script/`, etc. keep compiling without any churn.
 *
 * Env (Ollama):
 *   OLLAMA_BASE_URL    (default: http://localhost:11434)
 *   OLLAMA_MODEL       (default: llama3.1:8b)
 *   OLLAMA_TIMEOUT_MS  (default: 120000)
 *
 * Env (Anthropic — fallback):
 *   ANTHROPIC_API_KEY        (required to use Anthropic at all)
 *   ANTHROPIC_MODEL          (default: claude-sonnet-4-6)
 *   ANTHROPIC_MAX_TOKENS     (default: 1024)
 *   ANTHROPIC_TIMEOUT_MS     (default: 120000)
 *
 * ## Universal rate-limit funnel (PR #96 / audit §F7)
 *
 * Every autonomous LLM call (anything that isn't a live user chat) must flow
 * through `learningRateLimiter` so the daily cap (`MARA_LEARNING_MAX_CALLS_PER_DAY`,
 * default 100/day) is actually enforced. Callers identify themselves via the
 * `source` opt:
 *
 *     llmChat(messages, { source: 'user_chat', temperature: 0.95 })   // bypasses
 *     llmGenerate(prompt, { source: 'cycle.phase_4.growth-engineer' }) // rate-limited
 *
 * If a rate-limited caller hits the cap (or the circuit is open after 3 LLM
 * failures), the call throws `LLMRateLimitedError` which agent code catches
 * and treats as "skip this phase / iteration". `user_chat` is NEVER throttled
 * here — it's a single live request per chat message and must stay snappy.
 */

import {
  checkAnthropicHealth as anthropicHealth,
} from './lib/anthropic-provider.js';
import {
  getAIResponse,
  getProvidersHealth,
  type ProviderHealth,
} from './lib/provider-router.js';
import { guardedLLMCall } from './mara-brain/rate-limiter.js';

// Retained for API compatibility with callers that read it.
export type LLMProvider = 'ollama' | 'anthropic';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Where this LLM call is coming from. Drives rate-limit accounting + log
 * tagging. `user_chat` is the only source that bypasses the daily cap.
 *
 * The template-literal variants are open-ended so call sites can be specific
 * (e.g. `cycle.phase_4.growth-engineer`, `agent.web-research`, `admin.read-book`)
 * without us having to enumerate every label up-front.
 */
export type LLMSource =
  | 'user_chat'
  | `cycle.${string}`
  | `agent.${string}`
  | `admin.${string}`
  | `learning.${string}`;

export interface LLMCallOpts {
  /**
   * Sampling temperature. Defaults preserve the historical behaviour of the
   * two original positional-arg call sites: 0.95 for `llmChat` (chatty Mara
   * persona) and 0.7 for `llmGenerate` (structured agent output).
   */
  temperature?: number;
  /**
   * Caller identity. Anything other than `user_chat` is routed through
   * `learningRateLimiter` and counts against the daily cap.
   */
  source?: LLMSource;
}

/**
 * Thrown when an autonomous (non-`user_chat`) caller is blocked by the
 * learning rate limiter — either the daily cap is exhausted or the circuit
 * breaker is open after consecutive failures. Agent code catches this and
 * treats the phase as skipped.
 */
export class LLMRateLimitedError extends Error {
  readonly source: LLMSource;
  constructor(source: LLMSource) {
    super(`LLM call from "${source}" skipped — daily cap reached or circuit open`);
    this.name = 'LLMRateLimitedError';
    this.source = source;
  }
}

/**
 * The provider that *would* be used right now. This is best-effort and
 * synchronous — it inspects env vars only, so a configured Ollama that
 * happens to be down today still reports as 'ollama'. For the live "is the
 * primary actually responding?" picture, hit `/api/ai/health` instead.
 */
export function getActiveProvider(): LLMProvider {
  if (process.env.OLLAMA_BASE_URL) return 'ollama';
  return 'anthropic';
}

/**
 * True iff at least one provider is configured. Callers (e.g. `decideRoute`
 * in `server/maraai/ai-router.ts`) use this to decide whether to attempt a
 * "central" AI call at all vs. falling straight to the localised
 * "catching my breath" message.
 */
export function isLLMConfigured(): boolean {
  return !!process.env.OLLAMA_BASE_URL || !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Normalise the second arg into a full `LLMCallOpts` object. Accepts either
 * a bare temperature number (legacy positional signature) or a full opts
 * object. Defaults `source` to `user_chat` so anything that hasn't been
 * migrated to tag itself stays on the unthrottled path — safer than
 * silently rate-limiting a live user request.
 */
function normaliseOpts(
  opts: LLMCallOpts | number | undefined,
  defaultTemp: number,
): { temperature: number; source: LLMSource } {
  if (opts == null) return { temperature: defaultTemp, source: 'user_chat' };
  if (typeof opts === 'number') return { temperature: opts, source: 'user_chat' };
  return {
    temperature: opts.temperature ?? defaultTemp,
    source: opts.source ?? 'user_chat',
  };
}

export async function llmChat(
  messages: LLMMessage[],
  opts: LLMCallOpts | number = {},
): Promise<string> {
  const { temperature, source } = normaliseOpts(opts, 0.95);
  const exec = async () => (await getAIResponse(messages, { temperature })).text;

  if (source === 'user_chat') {
    return exec();
  }

  const result = await guardedLLMCall(source, exec);
  if (result === null) {
    throw new LLMRateLimitedError(source);
  }
  return result;
}

export async function llmGenerate(
  prompt: string,
  opts: LLMCallOpts | number = {},
): Promise<string> {
  const { temperature, source } = normaliseOpts(opts, 0.7);
  return llmChat([{ role: 'user', content: prompt }], { temperature, source });
}

/**
 * Lightweight health check for the Anthropic side specifically.
 *
 * Kept for backward compatibility with `routes.ts` and any deployment script
 * that imports this directly. New code should prefer `getAIHealth()` below
 * which returns the full primary+fallback picture.
 */
export async function checkAnthropicHealth(): Promise<{
  ok: boolean;
  provider: 'anthropic';
  model: string;
  error?: string;
}> {
  const h = await anthropicHealth();
  return { ok: h.ok, provider: 'anthropic', model: h.model, ...(h.error ? { error: h.error } : {}) };
}

export interface AIHealthSnapshot {
  provider: LLMProvider;
  configured: boolean;
  ok: boolean;
  model: string;
  error?: string;
  fallback?: ProviderHealth;
}

/**
 * Snapshot used by `/api/ai/health`. Returns the currently-primary provider
 * plus a `fallback` block describing the secondary, when one is configured.
 */
export async function getAIHealth(): Promise<AIHealthSnapshot> {
  const { primary, fallback } = await getProvidersHealth();
  const snap: AIHealthSnapshot = {
    provider: primary.provider,
    configured: primary.configured,
    ok: primary.ok,
    model: primary.model,
    ...(primary.error ? { error: primary.error } : {}),
  };
  if (fallback) {
    snap.fallback = fallback;
  }
  return snap;
}
