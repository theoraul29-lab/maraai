/**
 * LLM Abstraction Layer — Anthropic Claude
 *
 * Single provider. Required env:
 *   ANTHROPIC_API_KEY           (required — get one from https://console.anthropic.com/settings/keys)
 *   ANTHROPIC_MODEL             (optional — default: claude-sonnet-4-6)
 *   ANTHROPIC_MAX_TOKENS        (optional — default: 1024)
 *   ANTHROPIC_TIMEOUT_MS        (optional — default: 120000)
 */

import Anthropic from '@anthropic-ai/sdk';

// Retained for API compatibility with callers that used to pass/read this.
export type LLMProvider = 'anthropic';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function getActiveProvider(): LLMProvider {
  return 'anthropic';
}

export function isLLMConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

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
  // Rebuild the client if the key changed (e.g. after hot-reload of env).
  if (!clientInstance || clientKey !== apiKey) {
    clientInstance = new Anthropic({ apiKey, timeout: getTimeoutMs() });
    clientKey = apiKey;
  }
  return clientInstance;
}

/**
 * Anthropic expects `system` as a separate parameter and `messages` as only
 * user/assistant turns with strictly alternating roles (first must be `user`).
 *
 * Callers in this app often produce consecutive `user` turns because the
 * incoming message is saved to chat history *before* history is read back,
 * and then the current user message is appended again. We normalize here so
 * the Anthropic API never 400s on "consecutive user messages":
 *
 *   - Multiple system messages are joined into one `system` string.
 *   - Empty/whitespace-only turns are dropped.
 *   - Consecutive turns with the same role are merged (content joined with
 *     a blank line) so roles alternate.
 *   - A leading `assistant` turn is dropped (Anthropic requires the first
 *     turn to be `user`).
 */
function splitSystemAndMessages(messages: LLMMessage[]): {
  system: string | undefined;
  turns: { role: 'user' | 'assistant'; content: string }[];
} {
  const systemParts: string[] = [];
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

  // Anthropic requires the first message to be `user`.
  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    turns: merged,
  };
}

export async function llmChat(messages: LLMMessage[], temperature = 0.95): Promise<string> {
  const client = getClient();
  const { system, turns } = splitSystemAndMessages(messages);

  // Anthropic requires at least one user/assistant message.
  if (turns.length === 0) {
    throw new Error('Anthropic chat requires at least one user or assistant message.');
  }

  const res = await client.messages.create({
    model: getModel(),
    max_tokens: getMaxTokens(),
    temperature,
    ...(system ? { system } : {}),
    messages: turns,
  });

  return res.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

export async function llmGenerate(prompt: string, temperature = 0.7): Promise<string> {
  return llmChat([{ role: 'user', content: prompt }], temperature);
}

/**
 * Lightweight health check. Verifies the API key is present and that the SDK
 * can be instantiated. Intentionally does NOT issue a live API call — we do
 * not want to burn tokens on every /api/ai/health poll.
 */
export async function checkAnthropicHealth(): Promise<{
  ok: boolean;
  provider: 'anthropic';
  model: string;
  error?: string;
}> {
  const model = getModel();
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      provider: 'anthropic',
      model,
      error: 'ANTHROPIC_API_KEY is not set',
    };
  }
  try {
    getClient();
    return { ok: true, provider: 'anthropic', model };
  } catch (err) {
    return {
      ok: false,
      provider: 'anthropic',
      model,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
