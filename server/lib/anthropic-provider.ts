/**
 * Anthropic provider — paid fallback when Ollama isn't reachable.
 *
 * Wraps the existing Anthropic SDK calls into the shared `AIProvider`
 * interface. Reuses the same env vars as the legacy `server/llm.ts` so any
 * existing deployment keeps working unchanged.
 */

import Anthropic from '@anthropic-ai/sdk';

import type {
  AIChatOptions,
  AIMessage,
  AIProvider,
  AIResponse,
} from './ai-provider.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

function getModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

function getMaxTokens(): number {
  const raw = process.env.ANTHROPIC_MAX_TOKENS;
  if (!raw) return DEFAULT_MAX_TOKENS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_TOKENS;
}

function getTimeoutMs(): number {
  const raw = process.env.ANTHROPIC_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

let clientInstance: Anthropic | null = null;
let clientKey: string | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Cannot call Anthropic Claude API.');
  }
  if (!clientInstance || clientKey !== apiKey) {
    clientInstance = new Anthropic({ apiKey, timeout: getTimeoutMs() });
    clientKey = apiKey;
  }
  return clientInstance;
}

/**
 * Anthropic expects `system` as a separate parameter and `messages` as only
 * user/assistant turns with strictly alternating roles starting with `user`.
 * Same shape as the legacy `splitSystemAndMessages()` in `server/llm.ts` —
 * kept verbatim so callers see identical behaviour.
 */
function splitSystemAndMessages(
  messages: AIMessage[],
  extraSystem: string | undefined,
): {
  system: string | undefined;
  turns: { role: 'user' | 'assistant'; content: string }[];
} {
  const systemParts: string[] = [];
  if (extraSystem && extraSystem.trim().length > 0) systemParts.push(extraSystem);
  const rawTurns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content && m.content.trim().length > 0) systemParts.push(m.content);
    } else if (m.content && m.content.trim().length > 0) {
      rawTurns.push({ role: m.role, content: m.content });
    }
  }

  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const t of rawTurns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) {
      last.content = `${last.content}\n\n${t.content}`;
    } else {
      merged.push({ ...t });
    }
  }

  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    turns: merged,
  };
}

class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;

  async isAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async chat(messages: AIMessage[], opts: AIChatOptions = {}): Promise<AIResponse> {
    const client = getClient();
    const model = getModel();
    const { system, turns } = splitSystemAndMessages(messages, opts.systemPrompt);

    if (turns.length === 0) {
      throw new Error('Anthropic chat requires at least one user or assistant message.');
    }

    const res = await client.messages.create({
      model,
      max_tokens: getMaxTokens(),
      ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
      ...(system ? { system } : {}),
      messages: turns,
    });

    const text = res.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    return {
      text,
      provider: 'anthropic',
      model,
    };
  }
}

export const anthropicProvider: AIProvider = new AnthropicProvider();

/**
 * Lightweight readiness probe. Mirrors the legacy `checkAnthropicHealth` so
 * `/api/ai/health` keeps reporting the same shape for the Anthropic side.
 */
export async function checkAnthropicHealth(): Promise<{
  ok: boolean;
  model: string;
  error?: string;
}> {
  const model = getModel();
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, model, error: 'ANTHROPIC_API_KEY is not set' };
  }
  try {
    getClient();
    return { ok: true, model };
  } catch (err) {
    return { ok: false, model, error: err instanceof Error ? err.message : String(err) };
  }
}
