/**
 * Provider router — picks Ollama first, falls back to Anthropic, degrades
 * gracefully when neither is reachable.
 *
 * Priority:
 *   1. Ollama (when OLLAMA_BASE_URL is set AND `/api/tags` responds).
 *   2. Anthropic (when ANTHROPIC_API_KEY is set).
 *   3. Graceful "I'm catching my breath" — reuses the localised message
 *      already rendered by `server/ai.ts` and `server/maraai/ai-router.ts`.
 *      We surface it here as a thrown sentinel so the caller (server/llm.ts)
 *      can preserve its existing try/catch behaviour rather than learning a
 *      new return shape.
 */

import {
  type AIChatOptions,
  type AIMessage,
  type AIProviderName,
  type AIResponse,
} from './ai-provider.js';
import { anthropicProvider, anthropicBrainProvider } from './anthropic-provider.js';
import { ollamaProvider } from './ollama-provider.js';
import { circuitIsAvailable, circuitRecordSuccess, circuitRecordFailure, getAllCircuitStatuses } from './circuit-breaker.js';
import { isOllamaForcedFallback, recordOllamaFailure, recordOllamaSuccess } from '../middleware/costGuard.js';
import { getEffectiveAnthropicApiKey } from './anthropic-key-store.js';
import { getBrainRunContext } from '../mara-brain/run-context.js';

function recordProviderCall(
  provider: AIProviderName,
  model: string,
  source: string | undefined,
  startedAt: number,
  success: boolean,
  error?: unknown,
): void {
  getBrainRunContext()?.recordLLMCall({
    provider,
    model,
    source,
    success,
    latencyMs: Date.now() - startedAt,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  });
}

export class NoProviderAvailableError extends Error {
  constructor() {
    super('No AI provider is currently available.');
    this.name = 'NoProviderAvailableError';
  }
}

function ollamaConfigured(): boolean {
  // Treat OLLAMA_BASE_URL=<empty> as "not configured" so a default-only
  // localhost setup doesn't accidentally win on a server that has no Ollama.
  return !!process.env.OLLAMA_BASE_URL;
}

function anthropicConfigured(): boolean {
  return !!getEffectiveAnthropicApiKey();
}

function fallbackEnabled(): boolean {
  return process.env.ANTHROPIC_FALLBACK_ENABLED !== 'false';
}

function preferredProvider(): AIProviderName {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (configured === 'anthropic') return 'anthropic';
  if (configured === 'ollama') return 'ollama';
  return ollamaConfigured() ? 'ollama' : 'anthropic';
}

let lastLoggedProvider: AIProviderName | null = null;
function logProviderOnce(provider: AIProviderName): void {
  if (lastLoggedProvider === provider) return;
  lastLoggedProvider = provider;
  // eslint-disable-next-line no-console -- intentional one-shot router log
  console.info(`[AI Router] Using provider: ${provider}`);
}

/**
 * Test-only hook. Production code never needs this.
 */
export function _resetProviderLog(): void {
  lastLoggedProvider = null;
}

export async function getAIResponse(
  messages: AIMessage[],
  opts: AIChatOptions = {},
): Promise<AIResponse> {
  const primary = preferredProvider();

  // 1) Try the configured primary provider.
  if (primary === 'ollama' && ollamaConfigured() && !isOllamaForcedFallback()) {
    if (!circuitIsAvailable('ollama')) {
      // eslint-disable-next-line no-console
      console.warn('[AI Router] Ollama circuit open; skipping to Anthropic.');
    } else {
      const startedAt = Date.now();
      try {
        if (await ollamaProvider.isAvailable()) {
          logProviderOnce('ollama');
          const result = await ollamaProvider.chat(messages, opts);
          recordProviderCall('ollama', result.model, opts.source, startedAt, true);
          circuitRecordSuccess('ollama');
          recordOllamaSuccess();
          return result;
        }
        recordOllamaFailure();
      } catch (err) {
        recordProviderCall('ollama', process.env.OLLAMA_MODEL || 'llama3.1:8b', opts.source, startedAt, false, err);
        circuitRecordFailure('ollama');
        recordOllamaFailure();
        // eslint-disable-next-line no-console
        console.warn('[AI Router] Ollama failed; falling back to Anthropic:', err);
      }
    }
  }

  // 2) Fall back to Anthropic when enabled. This is the default for
  // backwards compatibility and can be disabled explicitly.
  if (fallbackEnabled() && anthropicConfigured()) {
    if (!circuitIsAvailable('anthropic')) {
      throw new NoProviderAvailableError();
    }
    const startedAt = Date.now();
    try {
      logProviderOnce('anthropic');
      const result = await anthropicProvider.chat(messages, opts);
      recordProviderCall('anthropic', result.model, opts.source, startedAt, true);
      circuitRecordSuccess('anthropic');
      return result;
    } catch (err) {
      recordProviderCall('anthropic', process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', opts.source, startedAt, false, err);
      circuitRecordFailure('anthropic');
      throw err;
    }
  }

  // 3) Nothing usable.
  throw new NoProviderAvailableError();
}

export interface ProviderHealth {
  provider: AIProviderName;
  configured: boolean;
  ok: boolean;
  model: string;
  error?: string;
}

async function describeOllama(): Promise<ProviderHealth> {
  const configured = ollamaConfigured();
  const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
  if (!configured) {
    return { provider: 'ollama', configured: false, ok: false, model };
  }
  try {
    const ok = await ollamaProvider.isAvailable();
    return { provider: 'ollama', configured: true, ok, model };
  } catch (err) {
    return {
      provider: 'ollama',
      configured: true,
      ok: false,
      model,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function describeAnthropic(): ProviderHealth {
  const configured = anthropicConfigured();
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  if (!configured) return { provider: 'anthropic', configured: false, ok: false, model };
  // `configured` only proves the API key is set — it says nothing about
  // whether real calls are actually succeeding. Fold in the circuit
  // breaker so a genuinely broken Anthropic (bad key, exhausted credit
  // balance, sustained API errors) shows ok:false here instead of a
  // false-positive "fallback is healthy" that only gets discovered when
  // both Ollama AND Anthropic are needed at the same time.
  const breaker = getAllCircuitStatuses().find((s) => s.provider === 'anthropic');
  const ok = breaker?.state !== 'open';
  return {
    provider: 'anthropic',
    configured: true,
    ok,
    model,
    ...(ok ? {} : { error: `circuit open after ${breaker?.failures} consecutive failure(s)` }),
  };
}

/**
 * Brain-only route — folosit de llm.ts când source !== 'user_chat'.
 * Foloseşte ANTHROPIC_BRAIN_API_KEY (fallback la ANTHROPIC_API_KEY).
 * Nu trece prin Ollama — brain-ul rulează exclusiv pe Claude.
 */
export async function getBrainAIResponse(
  messages: AIMessage[],
  opts: AIChatOptions = {},
): Promise<AIResponse> {
  const primary = preferredProvider();

  // Brain uses the same provider decision as user chat. Extended thinking is
  // still available when the Anthropic fallback answers the request.
  if (primary === 'ollama' && ollamaConfigured() && !isOllamaForcedFallback()) {
    if (circuitIsAvailable('ollama')) {
      const startedAt = Date.now();
      try {
        if (await ollamaProvider.isAvailable()) {
          logProviderOnce('ollama');
          const result = await ollamaProvider.chat(messages, opts);
          recordProviderCall('ollama', result.model, opts.source, startedAt, true);
          circuitRecordSuccess('ollama');
          recordOllamaSuccess();
          return result;
        }
        recordOllamaFailure();
      } catch (err) {
        recordProviderCall('ollama', process.env.OLLAMA_MODEL || 'llama3.1:8b', opts.source, startedAt, false, err);
        circuitRecordFailure('ollama');
        recordOllamaFailure();
        // eslint-disable-next-line no-console
        console.warn('[AI Router] Brain Ollama failed; falling back to Anthropic:', err);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn('[AI Router] Brain Ollama circuit open; skipping to Anthropic.');
    }
  }

  if (fallbackEnabled() && await anthropicBrainProvider.isAvailable()) {
    if (!circuitIsAvailable('anthropic')) {
      throw new NoProviderAvailableError();
    }
    const startedAt = Date.now();
    try {
      logProviderOnce('anthropic');
      const result = await anthropicBrainProvider.chat(messages, opts);
      recordProviderCall('anthropic', result.model, opts.source, startedAt, true);
      circuitRecordSuccess('anthropic');
      return result;
    } catch (err) {
      recordProviderCall('anthropic', process.env.ANTHROPIC_BRAIN_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', opts.source, startedAt, false, err);
      circuitRecordFailure('anthropic');
      throw err;
    }
  }

  throw new NoProviderAvailableError();
}

// ── P2P browser-task fallback ──────────────────────────────────────────────
//
// For non-urgent, pre-processable work (text analysis, template generation)
// we try the P2P browser task queue first. If no node picks up the task
// within P2P_TIMEOUT_MS we fall through to Anthropic as normal.
//
// NOTE: Browser nodes run lightweight JS (not LLMs). This offloads
// pre/post-processing work, NOT full chat inference.

import { createTask, waitForTaskResult, type CreateTaskInput } from '../maraai/p2p-tasks.js';

const P2P_TIMEOUT_MS = 30_000;

let p2pSuccessCount = 0;
let p2pFailureCount = 0;

export function getP2PSuccessRate(): { success: number; failure: number; rate: number } {
  const total = p2pSuccessCount + p2pFailureCount;
  return { success: p2pSuccessCount, failure: p2pFailureCount, rate: total > 0 ? p2pSuccessCount / total : 0 };
}

/**
 * Try offloading a lightweight task to P2P browser nodes.
 * Returns the result JSON if a node completes it within timeout, null otherwise.
 * The caller falls back to Anthropic on null.
 */
export async function tryP2PTask(
  input: CreateTaskInput,
  timeoutMs = P2P_TIMEOUT_MS,
): Promise<Record<string, unknown> | null> {
  try {
    const task = await createTask(input);
    const result = await waitForTaskResult(task.id, timeoutMs);
    p2pSuccessCount++;
    // eslint-disable-next-line no-console
    console.info(`[P2P] Task ${task.id} (${input.type}) completed by browser node.`);
    return result;
  } catch {
    p2pFailureCount++;
    return null;
  }
}

/**
 * Returns a health snapshot for both providers. Used by `/api/ai/health` to
 * surface which provider is primary today and what the fallback looks like.
 */
export async function getProvidersHealth(): Promise<{
  primary: ProviderHealth;
  fallback: ProviderHealth | null;
}> {
  const ollama = await describeOllama();
  const anthropic = describeAnthropic();

  // Primary == whichever we'd actually pick *right now*.
  if (preferredProvider() === 'ollama' && ollama.configured && ollama.ok) {
    return { primary: ollama, fallback: anthropic.configured ? anthropic : null };
  }
  if (preferredProvider() === 'anthropic' && anthropic.configured) {
    return { primary: anthropic, fallback: ollama.configured ? ollama : null };
  }
  // Nothing configured — surface Ollama as primary anyway so the dashboard
  // shows the intended priority order.
  return { primary: ollama, fallback: anthropic.configured ? anthropic : null };
}
