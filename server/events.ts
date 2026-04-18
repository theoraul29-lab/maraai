/**
 * Platform event bus (PR I).
 *
 * A typed wrapper around Node's `EventEmitter` used as a cross-module
 * communication channel. The goal is to keep feature modules loosely coupled:
 * Writers Hub and Reels simply `emit('content.published', ...)` when they
 * finish persisting a new item, and anything that cares about "new content"
 * (unified feed cache busts, notification fan-out, Mara Brain ingestion,
 * analytics counters, …) subscribes once at boot.
 *
 * Delivery semantics (intentional):
 *   - Synchronous emit in-process, no persistence.
 *   - Handlers must not throw — they are wrapped so a failing handler does
 *     not prevent other subscribers from running or propagate to the
 *     emitting code path.
 *   - "At-most-once" per process. Durable fan-out is a separate problem
 *     (Redis / Kafka) not in scope here; we lean on the existing DB as the
 *     source of truth and use events only for advisory side-effects.
 *
 * Scope deferred:
 *   - Out-of-process fan-out. When we add a second instance we will swap
 *     the emitter for a Redis pub/sub implementation behind the same type
 *     map. Call sites do not change.
 *   - Replay / dead-letter queues.
 */

import { EventEmitter } from 'events';

// --- Event payload types -----------------------------------------------------

export type ContentKind = 'reel' | 'writer_page';

export interface ContentPublishedEvent {
  kind: ContentKind;
  id: number;
  userId: string;
  title: string;
  visibility: 'public' | 'vip' | 'paid';
  publishedAt: Date;
}

export interface UserFollowEvent {
  followerId: string;
  followingId: string;
  at: Date;
}

export interface PlatformEventMap {
  'content.published': ContentPublishedEvent;
  'user.followed': UserFollowEvent;
  'user.unfollowed': UserFollowEvent;
}

export type PlatformEventKey = keyof PlatformEventMap;

// --- Typed bus ---------------------------------------------------------------

class PlatformBus {
  private inner = new EventEmitter();

  constructor() {
    // Allow many subscribers without Node's "possible EventEmitter memory
    // leak" warning — the app expects several modules to listen.
    this.inner.setMaxListeners(50);
  }

  emit<K extends PlatformEventKey>(key: K, payload: PlatformEventMap[K]): void {
    // Wildcard channel fires first so a generic logger / Mara-Brain ingest
    // can see every event without subscribing N times.
    this.inner.emit('*', { key, payload });
    this.inner.emit(key, payload);
  }

  on<K extends PlatformEventKey>(
    key: K,
    handler: (payload: PlatformEventMap[K]) => void | Promise<void>,
  ): () => void {
    const wrapped = (payload: PlatformEventMap[K]) => {
      try {
        const out = handler(payload);
        if (out && typeof (out as Promise<void>).catch === 'function') {
          (out as Promise<void>).catch((err) => {
            console.error(`[events] handler for "${String(key)}" rejected:`, err);
          });
        }
      } catch (err) {
        console.error(`[events] handler for "${String(key)}" threw:`, err);
      }
    };
    this.inner.on(key, wrapped);
    return () => this.inner.off(key, wrapped);
  }

  onAny(
    handler: (e: { key: PlatformEventKey; payload: unknown }) => void | Promise<void>,
  ): () => void {
    const wrapped = (e: { key: PlatformEventKey; payload: unknown }) => {
      try {
        const out = handler(e);
        // Mirror `on` so async wildcard handlers don't escape as unhandled
        // rejections (which can crash the process on recent Node versions).
        if (out && typeof (out as Promise<void>).catch === 'function') {
          (out as Promise<void>).catch((err) => {
            console.error('[events] wildcard handler rejected:', err);
          });
        }
      } catch (err) {
        console.error('[events] wildcard handler threw:', err);
      }
    };
    this.inner.on('*', wrapped as (...args: unknown[]) => void);
    return () => this.inner.off('*', wrapped as (...args: unknown[]) => void);
  }

  /** Test helper: wipe all listeners. Do not use from app code. */
  _reset(): void {
    this.inner.removeAllListeners();
  }
}

export const platformBus = new PlatformBus();

/**
 * Install the default subscribers. Call from server bootstrap.
 *
 * Each subscriber is best-effort and logs to console on failure. We avoid
 * coupling the event bus to a specific storage/notification implementation
 * here — individual modules register their own handlers as they are loaded.
 */
export function installDefaultSubscribers(): void {
  platformBus.onAny(({ key, payload }) => {
    // Minimal tracing so we can see cross-posting traffic in Railway logs
    // without loading every handler. Dropped to `debug` noise-level in prod.
    const verbose = process.env.EVENTS_VERBOSE === 'true';
    if (!verbose) return;
    try {
      console.log(`[events] ${key}:`, JSON.stringify(payload));
    } catch {
      console.log(`[events] ${key}: <unserialisable>`);
    }
  });
}
