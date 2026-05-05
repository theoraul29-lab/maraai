/**
 * AI Provider abstraction.
 *
 * Two concrete providers exist: Ollama (primary, self-hosted) and Anthropic
 * (paid fallback). Both implement the same `AIProvider` interface so the
 * router (`provider-router.ts`) can pick one at runtime without the rest of
 * the codebase caring.
 */

export type AIRole = 'user' | 'assistant' | 'system';

export interface AIMessage {
  role: AIRole;
  content: string;
}

export type AIProviderName = 'ollama' | 'anthropic';

export interface AIResponse {
  text: string;
  provider: AIProviderName;
  model: string;
}

export interface AIChatOptions {
  /**
   * Sampling temperature.
   *
   * The legacy `llmChat()` call sites in this repo pass either 0.95 (chatty
   * Mara persona) or 0.7 (structured output from brain agents). Providers
   * should honour this verbatim — do NOT clamp or rewrite it.
   */
  temperature?: number;

  /**
   * System prompt. Anthropic wants this as a top-level `system` field;
   * Ollama wants it as a leading `system` message in the messages array.
   * The provider itself owns that translation.
   */
  systemPrompt?: string;
}

export interface AIProvider {
  readonly name: AIProviderName;

  /**
   * Quick liveness check. Should be cheap and idempotent — it gets called
   * on every routing decision. Implementations are expected to add their
   * own short-lived cache to keep the cost bounded under traffic.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Single-turn chat. The provider is responsible for normalising the
   * message list into whatever shape its underlying API expects.
   */
  chat(messages: AIMessage[], opts?: AIChatOptions): Promise<AIResponse>;
}
