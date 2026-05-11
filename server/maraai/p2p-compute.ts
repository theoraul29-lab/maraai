// P2P AI compute orchestration.
//
// When a peer connects via WebSocket and announces `p2p-ollama-ready`, we
// register their node as compute-capable. The AI router (server/maraai/
// ai-router.ts) can then dispatch a `p2p-ai-job` to that peer, await
// `p2p-ai-result`, and award the peer's owner Mara Credits.
//
// HARD CONSTRAINTS:
//   * Job ids are server-generated and unguessable (used as the credit
//     idempotency key — a malicious peer must NOT be able to replay an
//     award by reusing an old jobId).
//   * Only a peer that received a specific jobId can submit a result for
//     it. We track `inFlight` server-side and discard any result whose
//     jobId we never issued.
//   * Result text is hashed (SHA-256) and logged to ai_route_log. We do
//     NOT trust the peer's `durationMs` — we measure latency on the
//     server side from issue → resolve.

import { randomUUID, createHash } from 'crypto';
import { awardCredits, CREDIT_AMOUNTS, CREDIT_REASONS } from './credits.js';

export type ComputePeerInfo = {
  /** WebSocket-bound user id (the owner of the desktop running Ollama). */
  userId: string;
  /** Free-form node identifier (matches `p2p_nodes.node_id` when registered). */
  nodeId?: string | null;
  /** Model the peer reports — e.g. `llama3.1:8b`. */
  model: string;
  /** Optional Ollama version string for diagnostics. */
  version?: string | null;
  /** Health score; we use the existing p2p_nodes.score as the source of truth in routing. */
  registeredAtMs: number;
  /** Last time we saw this peer alive (ready ack or successful result). */
  lastSeenAtMs: number;
};

export type AIJobMessage = {
  jobId: string;
  messages: { role: string; content: string }[];
  systemPrompt?: string | null;
  temperature?: number;
  timeoutMs?: number;
};

export type InFlightJob = {
  jobId: string;
  peerUserId: string;
  issuedAtMs: number;
  /** Resolves with the peer's result text or rejects on error/timeout. */
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timeoutHandle: NodeJS.Timeout;
};

const peers = new Map<string, ComputePeerInfo>();
const inFlight = new Map<string, InFlightJob>();
/**
 * Per-user WebSocket sender. Populated by the WS handler in server/index.ts
 * on `connection`, cleared on `close` / kill switch. Kept here (not in
 * server/index.ts) so the AI router can dispatch jobs without depending
 * on the index module — that would create a circular import.
 */
const sendFns = new Map<string, (payload: string) => void>();

/** WS handler binds the send fn for an authenticated user. */
export function bindPeerSender(userId: string, send: (payload: string) => void): void {
  sendFns.set(userId, send);
}

/** WS handler removes the binding on disconnect. */
export function unbindPeerSender(userId: string): void {
  sendFns.delete(userId);
}

/** Snapshot of compute-ready peers (excluding the requesting user's own nodes). */
export function listComputePeers(excludeUserId?: string | null): ComputePeerInfo[] {
  const out: ComputePeerInfo[] = [];
  for (const peer of peers.values()) {
    if (excludeUserId && peer.userId === excludeUserId) continue;
    out.push(peer);
  }
  return out;
}

export function isComputeAvailable(): boolean {
  return peers.size > 0;
}

/**
 * Mark a peer's Ollama as ready. Idempotent: re-emitting `p2p-ollama-ready`
 * only refreshes lastSeenAtMs.
 */
export function registerComputePeer(input: {
  userId: string;
  nodeId?: string | null;
  model?: string;
  version?: string | null;
}): ComputePeerInfo {
  const now = Date.now();
  const existing = peers.get(input.userId);
  const info: ComputePeerInfo = {
    userId: input.userId,
    nodeId: input.nodeId ?? existing?.nodeId ?? null,
    model: input.model || existing?.model || 'llama3.1:8b',
    version: input.version ?? existing?.version ?? null,
    registeredAtMs: existing?.registeredAtMs ?? now,
    lastSeenAtMs: now,
  };
  peers.set(input.userId, info);
  return info;
}

/** Drop a peer from the compute pool (Ollama stopped, ws disconnected, kill switch, etc.). */
export function unregisterComputePeer(userId: string): void {
  peers.delete(userId);
  // Reject any in-flight job that was waiting on this peer so the AI router
  // can fall through to Anthropic instead of hanging until the timeout.
  for (const job of inFlight.values()) {
    if (job.peerUserId === userId) {
      clearTimeout(job.timeoutHandle);
      inFlight.delete(job.jobId);
      job.reject(new Error('peer_disconnected'));
    }
  }
}

export type DispatchInput = {
  peerUserId: string;
  messages: { role: string; content: string }[];
  systemPrompt?: string | null;
  temperature?: number;
  timeoutMs?: number;
};

export type DispatchResult = {
  jobId: string;
  text: string;
  durationMs: number;
  peerUserId: string;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Dispatch an AI job to a peer and await the result. Throws on timeout,
 * peer disconnect, or peer-reported error so the caller (AI router) can
 * fall through to the central provider.
 */
export async function dispatchJob(input: DispatchInput): Promise<DispatchResult> {
  const peer = peers.get(input.peerUserId);
  if (!peer) {
    throw new Error('peer_unavailable');
  }
  const send = sendFns.get(input.peerUserId);
  if (!send) {
    // Peer announced ready but their socket has gone — heal the registry.
    peers.delete(input.peerUserId);
    throw new Error('peer_unavailable');
  }

  const jobId = `job_${randomUUID()}`;
  const timeoutMs = clamp(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1000, 120_000);
  const issuedAtMs = Date.now();

  const message: AIJobMessage = {
    jobId,
    messages: input.messages,
    systemPrompt: input.systemPrompt ?? null,
    temperature: input.temperature,
    timeoutMs,
  };

  const promise = new Promise<DispatchResult>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      inFlight.delete(jobId);
      reject(new Error('peer_timeout'));
    }, timeoutMs);

    inFlight.set(jobId, {
      jobId,
      peerUserId: input.peerUserId,
      issuedAtMs,
      resolve: (text: string) => {
        clearTimeout(timeoutHandle);
        inFlight.delete(jobId);
        resolve({
          jobId,
          text,
          durationMs: Date.now() - issuedAtMs,
          peerUserId: input.peerUserId,
        });
      },
      reject: (err: Error) => {
        clearTimeout(timeoutHandle);
        inFlight.delete(jobId);
        reject(err);
      },
      timeoutHandle,
    });
  });

  try {
    send(JSON.stringify({ type: 'p2p-ai-job', ...message }));
  } catch (err) {
    const inflight = inFlight.get(jobId);
    if (inflight) inflight.reject(err instanceof Error ? err : new Error('send_failed'));
    throw err;
  }

  return promise;
}

/**
 * Resolve an in-flight job with the peer's result. Called from the WS
 * handler on `p2p-ai-result`. Awards Mara Credits to the peer's owner
 * idempotently (the jobId is the idempotency key so retries / duplicate
 * messages don't double-pay).
 */
export async function resolveJob(input: {
  jobId: string;
  fromUserId: string;
  text: string;
  model?: string;
}): Promise<{ awarded: boolean; balance?: number }> {
  const job = inFlight.get(input.jobId);
  if (!job) {
    // Silently drop — either timeout already fired or the peer is replaying.
    return { awarded: false };
  }
  // Authentication: only the peer we issued this jobId to can resolve it.
  if (job.peerUserId !== input.fromUserId) {
    return { awarded: false };
  }

  job.resolve(input.text);

  // Update the peer's lastSeenAt — successful work counts as a heartbeat.
  const peer = peers.get(input.fromUserId);
  if (peer) peer.lastSeenAtMs = Date.now();

  // Compute hash so we have a tamper-evident audit trail without storing
  // the full response text in the credit ledger.
  const textHash = createHash('sha256').update(input.text).digest('hex').slice(0, 16);

  const balance = await awardCredits({
    userId: input.fromUserId,
    delta: CREDIT_AMOUNTS.p2pComputeJob,
    reason: CREDIT_REASONS.P2P_COMPUTE_JOB,
    idempotencyKey: input.jobId,
    meta: {
      jobId: input.jobId,
      model: input.model ?? peer?.model ?? null,
      textHash,
      durationMs: Date.now() - job.issuedAtMs,
    },
  });

  return { awarded: true, balance: balance.balance };
}

/** Reject an in-flight job because the peer reported a local failure. */
export function failJob(input: { jobId: string; fromUserId: string; error?: string }): void {
  const job = inFlight.get(input.jobId);
  if (!job || job.peerUserId !== input.fromUserId) return;
  job.reject(new Error(input.error ?? 'peer_error'));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
