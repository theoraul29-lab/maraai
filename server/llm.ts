/**
 * LLM Abstraction Layer
 *
 * Selects between Ollama (self-hosted) and Gemini based on env vars:
 *
 *   AI_PROVIDER=ollama|gemini   (default: "ollama" when OLLAMA_BASE_URL is set, else "gemini")
 *   OLLAMA_BASE_URL             (e.g. http://ollama:11434)
 *   OLLAMA_MODEL                (default: llama3.2:1b)
 *   GEMINI_API_KEY              (required when provider is gemini)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Provider selection ───────────────────────────────────────────────────────

export type LLMProvider = 'ollama' | 'gemini';

export function getActiveProvider(): LLMProvider {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === 'ollama') return 'ollama';
  if (explicit === 'gemini') return 'gemini';
  // Auto-detect: prefer Ollama when OLLAMA_BASE_URL is configured
  if (process.env.OLLAMA_BASE_URL) return 'ollama';
  return 'gemini';
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

// ─── Gemini provider ──────────────────────────────────────────────────────────

function getGenAI(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
}

async function geminiChat(messages: LLMMessage[], temperature = 0.95): Promise<string> {
  const genAI = getGenAI();
  const systemMessages = messages.filter((m) => m.role === 'system');
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const systemInstruction = systemMessages.map((m) => m.content).join('\n');
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    ...(systemInstruction ? { systemInstruction } : {}),
    generationConfig: { temperature },
  });

  const history = conversationMessages.slice(0, -1).map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: m.content }],
  }));

  const last = conversationMessages[conversationMessages.length - 1];
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(last?.content ?? '');
  return result.response.text();
}

async function geminiGenerate(prompt: string, temperature = 0.7): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { temperature },
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
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

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set. Cannot use Gemini provider.');
  }
  return geminiChat(messages, temperature);
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

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set. Cannot use Gemini provider.');
  }
  return geminiGenerate(prompt, temperature);
}

/** True when the active provider has its required config present. */
export function isLLMConfigured(): boolean {
  const provider = getActiveProvider();
  if (provider === 'ollama') return !!process.env.OLLAMA_BASE_URL;
  return !!process.env.GEMINI_API_KEY;
}
