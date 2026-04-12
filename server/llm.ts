/**
 * LLM Abstraction Layer
 *
 * Selects between Ollama (self-hosted) and OpenRouter based on env vars:
 *
 *   AI_PROVIDER=ollama|openrouter   (default: "ollama" when OLLAMA_BASE_URL is set, else "openrouter")
 *   OLLAMA_BASE_URL                 (e.g. http://ollama:11434)
 *   OLLAMA_MODEL                    (default: llama3.2:1b)
 *   OPENROUTER_API_KEY              (required when provider is openrouter)
 *   OPENROUTER_MODEL                (default: openai/gpt-4o-mini)
 *   OPENROUTER_BASE_URL             (default: https://openrouter.ai/api/v1)
 *   OPENROUTER_HTTP_REFERER         (optional — sent as HTTP-Referer header)
 *   OPENROUTER_X_TITLE              (optional — sent as X-Title header)
 */

// ─── Provider selection ───────────────────────────────────────────────────────

export type LLMProvider = 'ollama' | 'openrouter';

export function getActiveProvider(): LLMProvider {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === 'ollama') return 'ollama';
  // Accept 'openrouter' and legacy 'gemini' value for backward compatibility
  if (explicit === 'openrouter' || explicit === 'gemini') return 'openrouter';
  // Auto-detect: prefer Ollama when OLLAMA_BASE_URL is configured
  if (process.env.OLLAMA_BASE_URL) return 'ollama';
  return 'openrouter';
}

// ─── Shared message type ──────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── Ollama provider ──────────────────────────────────────────────────────────

const OLLAMA_DEFAULT_MODEL = 'llama3.2:1b';

function getOllamaBase(): string {
  return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL;
}

async function ollamaChat(messages: LLMMessage[], temperature = 0.95): Promise<string> {
  const base = getOllamaBase();
  const model = getOllamaModel();

  const body = JSON.stringify({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: false,
    options: { temperature },
  });

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(120_000), // 2-minute timeout
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Ollama request failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? '';
}

async function ollamaGenerate(prompt: string, temperature = 0.7): Promise<string> {
  return ollamaChat([{ role: 'user', content: prompt }], temperature);
}

/** Check if Ollama is reachable and the configured model is available. */
export async function checkOllamaHealth(): Promise<{
  ok: boolean;
  base: string;
  model: string;
  error?: string;
}> {
  const base = getOllamaBase();
  const model = getOllamaModel();

  try {
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return { ok: false, base, model, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    const modelAvailable = names.some((n) => n === model || n.startsWith(`${model}:`));
    if (!modelAvailable) {
      return {
        ok: false,
        base,
        model,
        error: `Model "${model}" not pulled yet. Available: ${names.join(', ') || 'none'}`,
      };
    }
    return { ok: true, base, model };
  } catch (err: unknown) {
    return { ok: false, base, model, error: String(err) };
  }
}

// ─── OpenRouter provider ──────────────────────────────────────────────────────

const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-4o-mini';
const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

function getOpenRouterConfig(): {
  apiKey: string;
  model: string;
  baseUrl: string;
  httpReferer?: string;
  xTitle?: string;
} {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL,
    baseUrl: (process.env.OPENROUTER_BASE_URL || OPENROUTER_DEFAULT_BASE_URL).replace(/\/$/, ''),
    httpReferer: process.env.OPENROUTER_HTTP_REFERER,
    xTitle: process.env.OPENROUTER_X_TITLE,
  };
}

async function openrouterChat(messages: LLMMessage[], temperature = 0.95): Promise<string> {
  const { apiKey, model, baseUrl, httpReferer, xTitle } = getOpenRouterConfig();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (httpReferer) headers['HTTP-Referer'] = httpReferer;
  if (xTitle) headers['X-Title'] = xTitle;

  const body = JSON.stringify({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
  });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(120_000), // 2-minute timeout
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

async function openrouterGenerate(prompt: string, temperature = 0.7): Promise<string> {
  return openrouterChat([{ role: 'user', content: prompt }], temperature);
}

// ─── Unified public API ───────────────────────────────────────────────────────

/**
 * Send a chat-style request to the configured LLM.
 * Accepts an array of messages (system/user/assistant).
 */
export async function llmChat(messages: LLMMessage[], temperature = 0.95): Promise<string> {
  const provider = getActiveProvider();

  if (provider === 'ollama') {
    if (!process.env.OLLAMA_BASE_URL) {
      throw new Error('OLLAMA_BASE_URL is not set. Cannot use Ollama provider.');
    }
    return ollamaChat(messages, temperature);
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set. Cannot use OpenRouter provider.');
  }
  return openrouterChat(messages, temperature);
}

/**
 * Send a simple generate request (single prompt → text response).
 */
export async function llmGenerate(prompt: string, temperature = 0.7): Promise<string> {
  const provider = getActiveProvider();

  if (provider === 'ollama') {
    if (!process.env.OLLAMA_BASE_URL) {
      throw new Error('OLLAMA_BASE_URL is not set. Cannot use Ollama provider.');
    }
    return ollamaGenerate(prompt, temperature);
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set. Cannot use OpenRouter provider.');
  }
  return openrouterGenerate(prompt, temperature);
}

/** True when the active provider has its required config present. */
export function isLLMConfigured(): boolean {
  const provider = getActiveProvider();
  if (provider === 'ollama') return !!process.env.OLLAMA_BASE_URL;
  return !!process.env.OPENROUTER_API_KEY;
}
