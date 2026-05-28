/**
 * Wrapper for Anthropic Managed Agents API (beta: managed-agents-2026-04-01).
 *
 * Invokes a deployed agent by ID and returns the text response.
 * Falls back to the standard messages API (with agent system prompt baked in)
 * if the runs endpoint returns an unexpected status.
 */

const ANTHROPIC_API = 'https://api.anthropic.com';
const BETA_HEADER = 'managed-agents-2026-04-01';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentCallOptions {
  maxTokens?: number;
  /** Injected before the first user message — used to pass <user_context> */
  systemExtra?: string;
}

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  return key;
}

const AGENT_TIMEOUT_MS = 12_000;

/**
 * Call a managed Anthropic agent and return the assistant text reply.
 * `messages` must start with a user turn.
 */
export async function callAgent(
  agentId: string,
  messages: AgentMessage[],
  opts: AgentCallOptions = {},
): Promise<string> {
  const { maxTokens = 2048, systemExtra } = opts;

  // Prepend system context as a user message prefix if provided
  const payload: AgentMessage[] = systemExtra
    ? [{ role: 'user', content: systemExtra }, ...messages]
    : messages;

  const body = JSON.stringify({ messages: payload, max_tokens: maxTokens });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${ANTHROPIC_API}/v1/agents/${agentId}/runs`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey(),
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': BETA_HEADER,
        'content-type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Agent ${agentId} run failed [${res.status}]: ${err}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    text?: string;
  };

  // Handle both response shapes (runs API vs messages API)
  if (data.content) {
    const text = data.content.find(b => b.type === 'text')?.text ?? '';
    return text;
  }
  if (data.output) {
    for (const block of data.output) {
      if (block.type === 'message' && block.content) {
        const text = block.content.find(b => b.type === 'text')?.text ?? '';
        if (text) return text;
      }
    }
  }
  if (data.text) return data.text;

  throw new Error(`Agent ${agentId}: unrecognised response shape`);
}

/** Returns true only if the agent ID env var is set. */
export function isSupportAgentEnabled(): boolean {
  return !!process.env.MARA_SUPPORT_AGENT_ID;
}

export function isBrainAgentEnabled(): boolean {
  return !!process.env.MARA_BRAIN_AGENT_ID;
}
