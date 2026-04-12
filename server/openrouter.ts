// OpenRouter LLM client — OpenAI-compatible Chat Completions via fetch (Node 20 built-in)

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterOptions {
  temperature?: number;
  max_tokens?: number;
}

/**
 * Returns true when OPENROUTER_API_KEY is set in the environment.
 */
export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Send a chat completion request to OpenRouter.
 * Uses Node 20 built-in fetch.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: OpenRouterOptions = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
  }
  if (process.env.OPENROUTER_X_TITLE) {
    headers['X-Title'] = process.env.OPENROUTER_X_TITLE;
  } else {
    headers['X-Title'] = 'MaraAI';
  }

  const body: Record<string, unknown> = {
    model: OPENROUTER_MODEL,
    messages,
  };
  if (options.temperature !== undefined) body['temperature'] = options.temperature;
  if (options.max_tokens !== undefined) body['max_tokens'] = options.max_tokens;

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter returned an unexpected response shape');
  }

  return content;
}

/**
 * Convenience: single user prompt with optional system instruction.
 */
export async function generate(
  prompt: string,
  systemInstruction?: string,
  options: OpenRouterOptions = {},
): Promise<string> {
  const messages: ChatMessage[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });
  return chatCompletion(messages, options);
}
