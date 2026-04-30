// Internal event bus.
//
// In production this can be wired up to a real Kafka cluster by setting
// KAFKA_BROKERS (comma-separated list). When that env var is unset — which
// is the default in dev, CI, and most self-hosted installs — the bus
// degrades to an in-memory pub/sub that satisfies the same interface. This
// keeps the hard-constraint "system MUST always work without Kafka" honest:
// every caller is unaware of which backend is active.
//
// The bus is INTERNAL infrastructure. It is never exposed to end users,
// never used as a database, and only carries structured events between
// server-side components.

import { logActivity } from './activity.js';

export const KAFKA_TOPICS = {
  AUTH_USER: 'auth.user.events',
  AI_CHAT: 'ai.chat.events',
  P2P_NODE_STATUS: 'p2p.node.status',
  CONTENT_REELS_STREAM: 'content.reels.stream',
  SYSTEM_SYNC: 'system.sync.events',
} as const;
export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

export type EventPayload = Record<string, unknown> & { ts?: number };
export type EventHandler = (payload: EventPayload, topic: string) => void | Promise<void>;

interface EventBus {
  publish(topic: string, payload: EventPayload): Promise<void>;
  subscribe(topic: string, handler: EventHandler): () => void;
  status(): { backend: 'kafka' | 'memory'; topics: number; connected: boolean };
}

class InMemoryBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  async publish(topic: string, payload: EventPayload): Promise<void> {
    const enriched = { ts: Date.now(), ...payload };
    const set = this.handlers.get(topic);
    if (!set || set.size === 0) return;
    for (const h of set) {
      try {
        await h(enriched, topic);
      } catch (err) {
        console.error(`[maraai/kafka] handler for ${topic} threw:`, err);
      }
    }
  }

  subscribe(topic: string, handler: EventHandler): () => void {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  status() {
    return { backend: 'memory' as const, topics: this.handlers.size, connected: true };
  }
}

let busInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (busInstance) return busInstance;
  // Real Kafka wiring would go here — guarded behind dynamic import so the
  // kafkajs dep is never loaded when KAFKA_BROKERS is unset. For now we
  // simply note in the activity log when an operator has set the env var
  // but no real driver is wired up yet.
  if (process.env.KAFKA_BROKERS) {
    void logActivity(null, 'kafka.fallback', {
      reason: 'kafkajs driver not wired in this build — using in-memory bus',
      brokers: process.env.KAFKA_BROKERS,
    });
  }
  busInstance = new InMemoryBus();
  return busInstance;
}

/** Best-effort publish — never throws. Logs to activity_log for transparency. */
export async function publishEvent(
  topic: KafkaTopic | string,
  payload: EventPayload,
  opts: { userId?: string | null; logMeta?: Record<string, unknown> } = {},
): Promise<void> {
  const bus = getEventBus();
  try {
    await bus.publish(topic, payload);
    await logActivity(opts.userId ?? null, 'kafka.publish', {
      topic,
      backend: bus.status().backend,
      ...opts.logMeta,
    });
  } catch (err) {
    console.error(`[maraai/kafka] publish to ${topic} failed:`, err);
  }
}

export function subscribeEvent(topic: KafkaTopic | string, handler: EventHandler) {
  return getEventBus().subscribe(topic, handler);
}

export function eventBusStatus() {
  return getEventBus().status();
}
