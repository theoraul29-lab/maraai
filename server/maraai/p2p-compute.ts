// Browser compute node registry.
//
// Tracks users who have enabled background compute via their browser worker.
// No Ollama installation required — all compute runs in JavaScript Web Workers
// in the user's browser. Users accept a single "Contribute to network" toggle
// and their idle browser time is used for lightweight tasks (text analysis,
// mission generation, content scoring, knowledge-base indexing).
//
// AI inference (LLM calls) always runs on our servers (Anthropic / server-side
// Ollama). Browsers never receive or process raw LLM prompts.
//
// HARD CONSTRAINTS:
//   * A node entry is created when the user's browser worker starts polling.
//   * Entries are removed on WebSocket disconnect or kill-switch.
//   * No jobId / credit system here — rewards for browser tasks are handled
//     entirely by p2p-tasks.ts (submitTaskResult → awardCredits).

export type BrowserComputeNode = {
  userId: string;
  nodeId: string | null;
  registeredAtMs: number;
  lastSeenAtMs: number;
};

const nodes = new Map<string, BrowserComputeNode>();

/** Mark a user's browser as compute-active. Idempotent — refreshes lastSeenAtMs. */
export function registerComputePeer(input: {
  userId: string;
  nodeId?: string | null;
}): BrowserComputeNode {
  const now = Date.now();
  const existing = nodes.get(input.userId);
  const node: BrowserComputeNode = {
    userId: input.userId,
    nodeId: input.nodeId ?? existing?.nodeId ?? null,
    registeredAtMs: existing?.registeredAtMs ?? now,
    lastSeenAtMs: now,
  };
  nodes.set(input.userId, node);
  return node;
}

/** Remove a user's browser node (disconnect, kill switch, idle timeout). */
export function unregisterComputePeer(userId: string): void {
  nodes.delete(userId);
}

/** Snapshot of active browser compute nodes (excluding the requesting user). */
export function listComputePeers(excludeUserId?: string | null): BrowserComputeNode[] {
  const out: BrowserComputeNode[] = [];
  for (const node of nodes.values()) {
    if (excludeUserId && node.userId === excludeUserId) continue;
    out.push(node);
  }
  return out;
}

export function isComputeAvailable(): boolean {
  return nodes.size > 0;
}
