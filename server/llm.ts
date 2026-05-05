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
 */

import {
  checkAnthropicHealth as anthropicHealth,
} from './lib/anthropic-provider.js';
import {
  getAIResponse,
  getProvidersHealth,
  type ProviderHealth,
} from './lib/provider-router.js';

// Retained for API compatibility with callers that read it.
export type LLMProvider = 'ollama' | 'anthropic';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

export async function llmChat(messages: LLMMessage[], temperature = 0.95): Promise<string> {
  const res = await getAIResponse(messages, { temperature });
  return res.text;
}

export async function llmGenerate(prompt: string, temperature = 0.7): Promise<string> {
  return llmChat([{ role: 'user', content: prompt }], temperature);
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
