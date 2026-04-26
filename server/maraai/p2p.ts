// P2P node registry, scoring, and kill switch.
//
// The mesh transport itself (WebRTC + STUN/TURN) lives in the existing
// WebSocket signaling layer in `server/index.ts`. This module is the
// authoritative server-side state for who is online, how reliable they
// have been, and whether the user has flipped their kill switch.
//
// HARD CONSTRAINTS:
//   * Nothing here ever runs without an authenticated user with explicit
//     P2P consent (see consent.ts → requireConsent('p2p')).
//   * The kill switch (`POST /api/p2p/kill-switch`) takes precedence over
//     every other consent flag — it sets `killSwitch=1` and the consent
//     view will report all P2P/background flags as false until the user
//     re-enables them.

import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { p2pNodes, type NewP2PNode, type P2PNode } from '../../shared/schema.js';
import { logActivity } from './activity.js';
import { publishEvent, KAFKA_TOPICS } from './kafka.js';
import { getConsent, updateConsent } from './consent.js';

type OnlinePeer = {
  nodeId: string;
  userId: string;
  score: number;
  bytesIn: number;
  bytesOut: number;
  lastBeatMs: number;
};

/**
 * In-memory online registry. WebSocket disconnect drops the entry; a
 * heartbeat refreshes it. We mirror to `p2p_nodes` for durability so the
 * transparency dashboard can reflect lifetime stats across restarts.
 */
const online = new Map<string, OnlinePeer>();

export type RegisterNodeInput = {
  userId: string;
  deviceLabel?: string | null;
  nodeId?: string | null;
};

export type NodeView = {
  nodeId: string;
  userId: string;
  deviceLabel: string | null;
  status: 'online' | 'offline' | 'killed';
  score: number;
  uptimeSec: number;
  bytesIn: number;
  bytesOut: number;
  lastSeenAtMs: number | null;
};

function rowToView(row: P2PNode): NodeView {
  return {
    nodeId: row.nodeId,
    userId: row.userId,
    deviceLabel: row.deviceLabel ?? null,
    status: (row.status as NodeView['status']) ?? 'offline',
    score: row.score,
    uptimeSec: row.uptimeSec,
    bytesIn: row.bytesIn,
    bytesOut: row.bytesOut,
    lastSeenAtMs: row.lastSeenAt
      ? row.lastSeenAt instanceof Date
        ? row.lastSeenAt.getTime()
        : Number(row.lastSeenAt)
      : null,
  };
}

function newId(): string {
  // Lightweight unique-ish id without a crypto dep: timestamp + random.
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Register or upsert a node for the given user. Requires P2P consent. */
export async function registerNode(input: RegisterNodeInput): Promise<NodeView> {
  const consent = await getConsent(input.userId);
  if (consent.killSwitch) {
    throw Object.assign(new Error('Kill switch is active.'), { code: 'KILL_SWITCH' });
  }
  if (!consent.p2pEnabled) {
    throw Object.assign(new Error('P2P consent is not granted.'), { code: 'NO_CONSENT' });
  }
  if (consent.mode === 'centralized') {
    throw Object.assign(new Error('Centralized mode forbids P2P.'), { code: 'CENTRALIZED_MODE' });
  }

  const nodeId = input.nodeId || newId();
  const existing = (
    await db.select().from(p2pNodes).where(eq(p2pNodes.nodeId, nodeId)).limit(1)
  )[0];

  const now = new Date();
  const row: NewP2PNode = {
    nodeId,
    userId: input.userId,
    deviceLabel: input.deviceLabel ?? existing?.deviceLabel ?? null,
    status: 'online',
    score: existing?.score ?? 0,
    uptimeSec: existing?.uptimeSec ?? 0,
    bytesIn: existing?.bytesIn ?? 0,
    bytesOut: existing?.bytesOut ?? 0,
    lastSeenAt: now,
  };

  if (existing) {
    await db
      .update(p2pNodes)
      .set({ status: 'online', lastSeenAt: now, deviceLabel: row.deviceLabel ?? null })
      .where(eq(p2pNodes.nodeId, nodeId));
  } else {
    await db.insert(p2pNodes).values(row);
  }

  online.set(nodeId, {
    nodeId,
    userId: input.userId,
    score: row.score!,
    bytesIn: row.bytesIn!,
    bytesOut: row.bytesOut!,
    lastBeatMs: Date.now(),
  });

  await logActivity(input.userId, 'p2p.node.registered', { nodeId, deviceLabel: row.deviceLabel });
  await publishEvent(
    KAFKA_TOPICS.P2P_NODE_STATUS,
    { nodeId, userId: input.userId, status: 'online' },
    { userId: input.userId },
  );

  const stored = (await db.select().from(p2pNodes).where(eq(p2pNodes.nodeId, nodeId)).limit(1))[0];
  return rowToView(stored);
}

export type HeartbeatInput = {
  userId: string;
  nodeId: string;
  uptimeSec?: number;
  bytesIn?: number;
  bytesOut?: number;
  successCount?: number;
  failureCount?: number;
};

export async function heartbeat(h: HeartbeatInput): Promise<NodeView | null> {
  const row = (await db.select().from(p2pNodes).where(eq(p2pNodes.nodeId, h.nodeId)).limit(1))[0];
  if (!row || row.userId !== h.userId) return null;

  const consent = await getConsent(h.userId);
  if (consent.killSwitch || !consent.p2pEnabled) {
    await markOffline(h.nodeId);
    return null;
  }

  const now = new Date();
  const success = h.successCount ?? 0;
  const failure = h.failureCount ?? 0;
  // simple bounded score; +1 per success, -2 per failure, clamped [0..1000]
  const score = Math.max(0, Math.min(1000, row.score + success - failure * 2));

  const uptime = Math.max(row.uptimeSec, h.uptimeSec ?? row.uptimeSec);
  const bytesIn = Math.max(row.bytesIn, h.bytesIn ?? row.bytesIn);
  const bytesOut = Math.max(row.bytesOut, h.bytesOut ?? row.bytesOut);

  await db
    .update(p2pNodes)
    .set({ status: 'online', lastSeenAt: now, score, uptimeSec: uptime, bytesIn, bytesOut })
    .where(eq(p2pNodes.nodeId, h.nodeId));

  online.set(h.nodeId, {
    nodeId: h.nodeId,
    userId: h.userId,
    score,
    bytesIn,
    bytesOut,
    lastBeatMs: Date.now(),
  });

  await logActivity(h.userId, 'p2p.node.heartbeat', {
    nodeId: h.nodeId,
    score,
    bytesIn,
    bytesOut,
  });

  const updated = (await db.select().from(p2pNodes).where(eq(p2pNodes.nodeId, h.nodeId)).limit(1))[0];
  return rowToView(updated);
}

export async function markOffline(nodeId: string): Promise<void> {
  online.delete(nodeId);
  await db
    .update(p2pNodes)
    .set({ status: 'offline', lastSeenAt: new Date() })
    .where(eq(p2pNodes.nodeId, nodeId));
}

/** Activate the kill switch — disables every opt-in P2P/background flag. */
export async function activateKillSwitch(userId: string): Promise<void> {
  await updateConsent(userId, {
    killSwitch: true,
    p2pEnabled: false,
    backgroundNode: false,
    advancedAiRouting: false,
    mode: 'centralized',
  });

  // Mark every node owned by this user offline.
  const owned = await db.select().from(p2pNodes).where(eq(p2pNodes.userId, userId));
  for (const r of owned) {
    online.delete(r.nodeId);
  }
  await db
    .update(p2pNodes)
    .set({ status: 'killed' })
    .where(eq(p2pNodes.userId, userId));

  await logActivity(userId, 'p2p.kill_switch', {});
  await publishEvent(
    KAFKA_TOPICS.P2P_NODE_STATUS,
    { userId, killed: true },
    { userId },
  );
}

/** Online peers visible to a user (excludes their own nodes). */
export function listOnlineNodes(userId?: string | null): OnlinePeer[] {
  const peers: OnlinePeer[] = [];
  for (const peer of online.values()) {
    if (userId && peer.userId === userId) continue;
    peers.push(peer);
  }
  return peers;
}

export async function listMyNodes(userId: string): Promise<NodeView[]> {
  const rows = await db.select().from(p2pNodes).where(eq(p2pNodes.userId, userId));
  return rows.map(rowToView);
}

export async function deleteNode(userId: string, nodeId: string): Promise<boolean> {
  const row = (await db.select().from(p2pNodes).where(eq(p2pNodes.nodeId, nodeId)).limit(1))[0];
  if (!row || row.userId !== userId) return false;
  online.delete(nodeId);
  await db.delete(p2pNodes).where(and(eq(p2pNodes.nodeId, nodeId), eq(p2pNodes.userId, userId)));
  await logActivity(userId, 'p2p.node.heartbeat', { nodeId, deleted: true });
  return true;
}
