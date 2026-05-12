// Singleton advisory locks — backed by a single SQLite table.
//
// The rest of the codebase has no shared-memory primitive between separate
// Node processes (rolling deploys on Railway briefly run two replicas; a
// preview deploy on top of prod is similar). When two brain cycles fire
// inside the same ~30s window they can both call `learnFromText` on the
// same chat excerpt and both write into `mara_knowledge_base` before the
// transaction in `storeKnowledge` even runs. PR #96 closed the within-
// process race; this module closes the cross-process race by making one
// instance hold a TTL'd advisory lock that the other instance probes
// before scheduling its own cycle.
//
// Design choices:
//   * One row per lock name. Acquire = INSERT OR IGNORE, then SELECT to
//     verify we own it (or that the previous holder's lease expired).
//   * TTL keeps the lock self-healing — if the holder crashes, after the
//     lease expires any other instance can take over.
//   * Heartbeat extends the lease so a long-running but healthy cycle
//     never loses the lock to its own staleness.
//   * Release on SIGTERM/SIGINT so a graceful shutdown immediately frees
//     the lock for the next deploy.
//
// Caller pattern:
//   const lock = new SingletonLock('brain_cycle', { ttlMs: 10 * 60_000 });
//   if (!lock.acquire()) return; // another instance owns it
//   lock.startHeartbeat();
//   // ... do work ...
//   lock.release();

import { rawSqlite } from '../db.js';

export interface SingletonLockOptions {
  /** Lease length in ms. Heartbeat refreshes well before this. Required. */
  ttlMs: number;
  /** Heartbeat cadence. Defaults to `ttlMs / 3`. Must be < ttlMs. */
  heartbeatIntervalMs?: number;
  /** Stable holder name (e.g. hostname-pid). Defaults to a generated one. */
  holder?: string;
}

const DEFAULT_HOLDER = `${process.env.HOSTNAME ?? 'local'}-${process.pid}-${Date.now()}`;

function ensureTable(): void {
  rawSqlite.exec(`
    CREATE TABLE IF NOT EXISTS mara_singleton_locks (
      name TEXT PRIMARY KEY,
      holder TEXT NOT NULL,
      acquired_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      heartbeat_at INTEGER NOT NULL
    );
  `);
}

interface LockRow {
  name: string;
  holder: string;
  acquired_at: number;
  expires_at: number;
  heartbeat_at: number;
}

export class SingletonLock {
  readonly name: string;
  readonly holder: string;
  readonly ttlMs: number;
  readonly heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private acquired = false;

  constructor(name: string, opts: SingletonLockOptions) {
    if (!name || /[^a-z0-9_\-]/i.test(name)) {
      throw new Error(`SingletonLock: invalid name ${JSON.stringify(name)}`);
    }
    if (!Number.isFinite(opts.ttlMs) || opts.ttlMs <= 0) {
      throw new Error('SingletonLock: ttlMs must be a positive number');
    }
    const hb = opts.heartbeatIntervalMs ?? Math.max(1000, Math.floor(opts.ttlMs / 3));
    if (hb >= opts.ttlMs) {
      throw new Error('SingletonLock: heartbeatIntervalMs must be < ttlMs');
    }
    this.name = name;
    this.holder = opts.holder ?? DEFAULT_HOLDER;
    this.ttlMs = opts.ttlMs;
    this.heartbeatIntervalMs = hb;
    ensureTable();
  }

  /**
   * Try to take the lock. Returns true if this instance now owns it
   * (either fresh acquisition or successful steal of an expired lease).
   *
   * Safe to call repeatedly — if we already own it this is a no-op that
   * returns true.
   */
  acquire(): boolean {
    if (this.acquired) return true;
    const now = Date.now();
    const expiresAt = now + this.ttlMs;

    // Best-effort insert. If a row already exists we'll fall through to
    // the takeover branch below.
    rawSqlite
      .prepare(
        `INSERT OR IGNORE INTO mara_singleton_locks
           (name, holder, acquired_at, expires_at, heartbeat_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(this.name, this.holder, now, expiresAt, now);

    // Read back the current owner so we can decide if we got it.
    const row = rawSqlite
      .prepare<[string], LockRow>(`SELECT * FROM mara_singleton_locks WHERE name = ?`)
      .get(this.name);

    if (!row) {
      // INSERT OR IGNORE didn't insert and SELECT returned nothing —
      // shouldn't happen, but treat as failure.
      return false;
    }

    if (row.holder === this.holder) {
      this.acquired = true;
      return true;
    }

    // Someone else holds it — only steal if their lease has expired.
    if (row.expires_at < now) {
      const result = rawSqlite
        .prepare(
          `UPDATE mara_singleton_locks
             SET holder = ?, acquired_at = ?, expires_at = ?, heartbeat_at = ?
             WHERE name = ? AND expires_at < ?`,
        )
        .run(this.holder, now, expiresAt, now, this.name, now);
      if (result.changes === 1) {
        this.acquired = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Extend the lease. Returns true on successful heartbeat. Returns false
   * if another instance has stolen the lock (which means we've lost
   * ownership and the caller should stop work).
   */
  heartbeat(): boolean {
    if (!this.acquired) return false;
    const now = Date.now();
    const result = rawSqlite
      .prepare(
        `UPDATE mara_singleton_locks
           SET expires_at = ?, heartbeat_at = ?
           WHERE name = ? AND holder = ?`,
      )
      .run(now + this.ttlMs, now, this.name, this.holder);
    if (result.changes === 0) {
      // We've been evicted.
      this.acquired = false;
      return false;
    }
    return true;
  }

  /** Start a background heartbeat. Idempotent. */
  startHeartbeat(): void {
    if (this.heartbeatTimer || !this.acquired) return;
    this.heartbeatTimer = setInterval(() => {
      const ok = this.heartbeat();
      if (!ok && this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    }, this.heartbeatIntervalMs);
    // Don't let the timer keep the process alive on its own.
    this.heartbeatTimer.unref?.();
  }

  /** Stop heartbeating and remove the row if we still own it. Idempotent. */
  release(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.acquired) {
      rawSqlite
        .prepare(`DELETE FROM mara_singleton_locks WHERE name = ? AND holder = ?`)
        .run(this.name, this.holder);
      this.acquired = false;
    }
  }

  /** True if this instance currently owns the lock (per the most recent op). */
  isOwned(): boolean {
    return this.acquired;
  }

  /** Diagnostic — read the current row (or null if none). */
  inspect(): LockRow | null {
    return (
      rawSqlite
        .prepare<[string], LockRow>(`SELECT * FROM mara_singleton_locks WHERE name = ?`)
        .get(this.name) ?? null
    );
  }
}

/** Convenience accessor used by admin tooling. */
export function listSingletonLocks(): LockRow[] {
  ensureTable();
  return rawSqlite
    .prepare<[], LockRow>(`SELECT * FROM mara_singleton_locks ORDER BY name`)
    .all();
}
