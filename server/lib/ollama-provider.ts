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
 *   OLLAMA_MODEL     (default: qwen3:14b)
 *
 * Optional env:
 *   OLLAMA_TIMEOUT_MS  (default: 120000 — same shape as ANTHROPIC_TIMEOUT_MS)
 *
 * `think: false` is always sent: Qwen3 is a hybrid-reasoning model that
 * defaults to an internal <think> pass before every reply (confirmed via
 * `ollama show qwen3:14b` — thinking defaults to true). Ollama already keeps
 * that reasoning in a separate `message.thinking` field we never read, so it
 * was never leaking into replies — but it was still ~5x the eval tokens
 * (154 vs 30 in a side-by-side test) for a plain conversational reply that
 * gains nothing from step-by-step reasoning. Non-thinking models (the prior
 * llama3.1:8b, qwen3-coder:30b) just ignore the field.
 */

import type {
  AIChatOptions,
  AIMessage,
  AIProvider,
  AIResponse,
} from './ai-provider.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3:14b';
const DEFAULT_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 3_000;
const HEALTH_CACHE_TTL_MS = 30_000;
// Keeps the model resident in VRAM well past Ollama's 5m default so a
// conversation with real gaps between messages doesn't keep re-paying the
// ~10-13s cold load observed on this model/GPU.
const KEEP_ALIVE = '30m';
// Same reasoning as the Anthropic provider's MAX_TOOL_ROUNDS — bounds the
// internal call-execute-recall loop when tools are offered.
const MAX_TOOL_ROUNDS = 4;

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: false;
  think: false;
  keep_alive: string;
  tools?: OllamaToolDef[];
  options?: {
    temperature?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  message?: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
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
    if (!ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[Ollama] Health check got HTTP ${res.status} from ${getBaseUrl()}/api/tags: ${body.slice(0, 300)}`);
    }
  } catch (err) {
    ok = false;
    console.warn(`[Ollama] Health check failed against ${getBaseUrl()}/api/tags:`, err);
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
    let reqMessages = normaliseMessages(messages, opts.systemPrompt);
    if (reqMessages.length === 0 || reqMessages.every((m) => m.role === 'system')) {
      throw new Error('Ollama chat requires at least one user or assistant message.');
    }

    const tools: OllamaToolDef[] | undefined = opts.tools?.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body: OllamaChatRequest = {
        model,
        messages: reqMessages,
        stream: false,
        think: false,
        keep_alive: KEEP_ALIVE,
        ...(tools && tools.length > 0 ? { tools } : {}),
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
      const toolCalls = data.message?.tool_calls;

      if (!toolCalls || toolCalls.length === 0 || !opts.onToolCall) {
        const text = (data.message?.content ?? '').trim();
        if (!text) {
          throw new Error('Ollama returned an empty response.');
        }
        return { text, provider: 'ollama', model: data.model || model };
      }

      // Execute every requested tool call, append the assistant's tool-call
      // turn plus each tool's result, then loop for the model's real reply.
      reqMessages = [
        ...reqMessages,
        { role: 'assistant', content: data.message?.content ?? '', tool_calls: toolCalls },
      ];
      for (const call of toolCalls) {
        const result = await opts.onToolCall(call.function.name, call.function.arguments ?? {});
        reqMessages.push({ role: 'tool', content: result });
      }
    }

    throw new Error('Ollama chat: too many tool-call rounds without a final answer.');
  }
}

export const ollamaProvider: AIProvider = new OllamaProvider();
