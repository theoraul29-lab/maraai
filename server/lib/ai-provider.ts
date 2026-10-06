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

/**
 * A tool/function the model may call. `parameters` is a JSON Schema object
 * describing the arguments — passed to each provider's own tool-definition
 * shape verbatim (Anthropic: `input_schema`; Ollama: `function.parameters`).
 */
export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Executes a tool call and returns a short string result fed back to the
 * model as the tool's output. Provided by the caller (e.g. server/ai.ts),
 * never by the provider — this is the one place a tool's side effect
 * (a database write, in the save_memory case) actually happens, so the
 * caller is the only party that can decide what the model is allowed to
 * affect and with which server-derived identity.
 */
export type AIToolExecutor = (toolName: string, args: Record<string, unknown>) => Promise<string>;

export interface AIChatOptions {
  /** Internal source label for Brain dry-run telemetry. */
  source?: string;
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

  /**
   * Token budget for extended thinking (Claude only). When set, Anthropic's
   * extended thinking mode is enabled — the model reasons silently for up to
   * `thinkingBudget` tokens before producing its final answer. Ignored by
   * Ollama. Set to 0 or omit to disable.
   */
  thinkingBudget?: number;

  /**
   * Tools the model may call. When set together with `onToolCall`, a
   * provider's `chat()` runs its own bounded tool-call loop internally
   * (call → execute → feed result back → final call) and still returns only
   * the final natural-language `AIResponse.text` — callers never see raw
   * tool-call wire format, so this stays a provider-internal detail rather
   * than a second orchestration layer.
   */
  tools?: AIToolDefinition[];
  /** Required when `tools` is set — see `AIToolExecutor`. */
  onToolCall?: AIToolExecutor;
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
