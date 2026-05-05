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
import { anthropicProvider } from './anthropic-provider.js';
import { ollamaProvider } from './ollama-provider.js';

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
  return !!process.env.ANTHROPIC_API_KEY;
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
  // 1) Try Ollama if we have an explicit base URL configured.
  if (ollamaConfigured()) {
    try {
      if (await ollamaProvider.isAvailable()) {
        logProviderOnce('ollama');
        return await ollamaProvider.chat(messages, opts);
      }
    } catch (err) {
      // Log and fall through to Anthropic. We don't want Ollama hiccups to
      // take down the chat entirely if Anthropic is configured.
      // eslint-disable-next-line no-console
      console.warn('[AI Router] Ollama failed; falling back to Anthropic:', err);
    }
  }

  // 2) Fall back to Anthropic.
  if (anthropicConfigured()) {
    logProviderOnce('anthropic');
    return await anthropicProvider.chat(messages, opts);
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
  return { provider: 'anthropic', configured, ok: configured, model };
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
  if (ollama.configured && ollama.ok) {
    return { primary: ollama, fallback: anthropic.configured ? anthropic : null };
  }
  if (anthropic.configured) {
    return { primary: anthropic, fallback: ollama.configured ? ollama : null };
  }
  // Nothing configured — surface Ollama as primary anyway so the dashboard
  // shows the intended priority order.
  return { primary: ollama, fallback: anthropic.configured ? anthropic : null };
}
