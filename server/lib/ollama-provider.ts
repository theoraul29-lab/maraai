/**
 * Ollama provider — primary AI in MaraAI.
 *
 * Self-hosted, no per-token cost. Talks to a local (or tunneled) Ollama
 * server using the native `/api/chat` endpoint. We deliberately stay on the
 * native API rather than `/v1/chat/completions` so we can pass Ollama's
 * `options.temperature` directly and avoid the OpenAI-shim translation.
 *
 * Required env:
 *   OLLAMA_BASE_URL  (default: http://localhost:11434)
 *   OLLAMA_MODEL     (default: llama3.1:8b)
 *
 * Optional env:
 *   OLLAMA_TIMEOUT_MS  (default: 120000 — same shape as ANTHROPIC_TIMEOUT_MS)
 */

import type {
  AIChatOptions,
  AIMessage,
  AIProvider,
  AIResponse,
} from './ai-provider.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1:8b';
const DEFAULT_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 3_000;
const HEALTH_CACHE_TTL_MS = 30_000;

interface OllamaChatRequest {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  stream: false;
  options?: {
    temperature?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  message?: {
    role: string;
    content: string;
  };
  // Ollama also returns `done`, `total_duration`, etc. — ignored.
}

function getBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getModel(): string {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

function getTimeoutMs(): number {
  const raw = process.env.OLLAMA_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * Ollama only accepts strictly alternating user/assistant turns after the
 * (optional) leading system message — same constraint as Anthropic. Mirrors
 * the normalisation in `server/llm.ts` so behaviour is identical regardless
 * of which provider answers the call.
 */
function normaliseMessages(
  messages: AIMessage[],
  systemPrompt: string | undefined,
): OllamaChatRequest['messages'] {
  const systemParts: string[] = [];
  if (systemPrompt && systemPrompt.trim().length > 0) {
    systemParts.push(systemPrompt);
  }

  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content && m.content.trim().length > 0) systemParts.push(m.content);
      continue;
    }
    if (!m.content || m.content.trim().length === 0) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      turns.push({ role: m.role, content: m.content });
    }
  }

  while (turns.length > 0 && turns[0].role !== 'user') {
    turns.shift();
  }

  const out: OllamaChatRequest['messages'] = [];
  if (systemParts.length > 0) {
    out.push({ role: 'system', content: systemParts.join('\n\n') });
  }
  for (const t of turns) out.push(t);
  return out;
}

let cachedAvailability: { value: boolean; checkedAt: number } | null = null;

/**
 * Cached liveness probe. Hits `GET /api/tags` (lightweight model list) with
 * a 3s timeout. Successes and failures are both cached for 30s so a flapping
 * Ollama doesn't add 3s of latency to every chat request when it's down.
 */
async function pingOllama(): Promise<boolean> {
  if (cachedAvailability && Date.now() - cachedAvailability.checkedAt < HEALTH_CACHE_TTL_MS) {
    return cachedAvailability.value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  let ok = false;
  try {
    const res = await fetch(`${getBaseUrl()}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    ok = res.ok;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
  }

  cachedAvailability = { value: ok, checkedAt: Date.now() };
  return ok;
}

/**
 * Test-only hook. Production code should let the natural 30s TTL elapse.
 */
export function _resetOllamaAvailabilityCache(): void {
  cachedAvailability = null;
}

class OllamaProvider implements AIProvider {
  readonly name = 'ollama' as const;

  async isAvailable(): Promise<boolean> {
    return pingOllama();
  }

  async chat(messages: AIMessage[], opts: AIChatOptions = {}): Promise<AIResponse> {
    const model = getModel();
    const reqMessages = normaliseMessages(messages, opts.systemPrompt);
    if (reqMessages.length === 0 || reqMessages.every((m) => m.role === 'system')) {
      throw new Error('Ollama chat requires at least one user or assistant message.');
    }

    const body: OllamaChatRequest = {
      model,
      messages: reqMessages,
      stream: false,
      ...(typeof opts.temperature === 'number' ? { options: { temperature: opts.temperature } } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getTimeoutMs());
    let res: Response;
    try {
      res = await fetch(`${getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Bust the availability cache so the next call re-checks immediately
      // rather than waiting up to 30s — we just observed a real failure.
      cachedAvailability = null;
      const errBody = await res.text().catch(() => '');
      throw new Error(`Ollama /api/chat returned ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    const text = (data.message?.content ?? '').trim();
    if (!text) {
      throw new Error('Ollama returned an empty response.');
    }

    return {
      text,
      provider: 'ollama',
      model: data.model || model,
    };
  }
}

export const ollamaProvider: AIProvider = new OllamaProvider();
