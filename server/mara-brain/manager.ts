// Mara Brain Manager — centralized orchestration state + safe controls.
//
// Responsibilities:
//   - Track whether the brain scheduler is enabled (feature flag)
//   - Enforce single-cycle lock (no concurrent cycles)
//   - Expose last-run / next-run / last-error for admin dashboard
//   - Provide a rate-limited manual trigger
//   - Persist every completed cycle as a BrainLog via storage

import { storage } from '../storage.js';
import { runBrainCycle, runInitialLearning } from './core.js';
import { generateMarketingPost } from '../ai.js';
import { SingletonLock } from '../lib/singleton-lock.js';

export type BrainStatus = {
  enabled: boolean;
  running: boolean;
  /** True if this instance booted but failed to take the brain_cycle
   *  advisory lock — another replica is the active orchestrator. */
  passive: boolean;
  startedAt: string | null;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  lastKnowledgeLearned: number | null;
  nextRunAt: string | null;
  cycleIntervalMs: number;
  selfPostIntervalMs: number;
  selfPostEnabled: boolean;
  manualTriggerCooldownMs: number;
  manualTriggerAvailableAt: string | null;
};

// Defaults — overridable via env. Keep conservative for Railway free/hobby CPU.
// 2h interval — balances timely learning with Claude API cost (user pick).
// Override via BRAIN_CYCLE_INTERVAL_MS env var.
const DEFAULT_CYCLE_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2h
const DEFAULT_SELF_POST_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4h
const DEFAULT_MANUAL_COOLDOWN_MS = 5 * 60 * 1000; // 5min between manual triggers

function parseIntervalMs(envVal: string | undefined, fallback: number): number {
  if (!envVal) return fallback;
  const n = Number(envVal);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

class BrainManagerImpl {
  private _running = false;
  private _startedAt: number | null = null;
  private _lastRunAt: number | null = null;
  private _lastDurationMs: number | null = null;
  private _lastError: string | null = null;
  private _lastKnowledgeLearned: number | null = null;
  private _nextRunAt: number | null = null;
  private _lastManualTriggerAt: number | null = null;
  private _cycleTimer: NodeJS.Timeout | null = null;
  private _selfPostTimer: NodeJS.Timeout | null = null;
  private _initialTimeout: NodeJS.Timeout | null = null;
  private _started = false;
  // Cross-process advisory lock — prevents two instances (e.g. during a
  // Railway rolling deploy) from running brain cycles in parallel against
  // the same database. Lazily created in start() so unit tests can mock
  // the DB before instantiation.
  private _cycleLock: SingletonLock | null = null;
  private _passive = false; // true if we lost the lock at boot

  get cycleIntervalMs(): number {
    return parseIntervalMs(process.env.BRAIN_CYCLE_INTERVAL_MS, DEFAULT_CYCLE_INTERVAL_MS);
  }

  get selfPostIntervalMs(): number {
    return parseIntervalMs(process.env.BRAIN_SELF_POST_INTERVAL_MS, DEFAULT_SELF_POST_INTERVAL_MS);
  }

  get manualCooldownMs(): number {
    return parseIntervalMs(process.env.BRAIN_MANUAL_COOLDOWN_MS, DEFAULT_MANUAL_COOLDOWN_MS);
  }

  get isEnabled(): boolean {
    // Kill-switch: BRAIN_ENABLED=false forces off even if PROCESS_AI_TASKS=true.
    if (process.env.BRAIN_ENABLED === 'false') return false;
    // Default: on unless PROCESS_AI_TASKS is explicitly set to 'false'.
    // This is the PR C switchover: the brain now runs by default.
    const flag = process.env.PROCESS_AI_TASKS;
    if (flag === undefined) return true;
    return flag !== 'false';
  }

  /**
   * Whether Mara should auto-publish "Mara AI Insight" posts in the creator
   * feed every `selfPostIntervalMs`. Independent of the brain cycle itself
   * — set BRAIN_SELF_POST_ENABLED=false to keep autonomous learning on but
   * stop the auto-marketing posts.
   * Default: on (preserves historical behaviour).
   */
  get isSelfPostEnabled(): boolean {
    return process.env.BRAIN_SELF_POST_ENABLED !== 'false';
  }

  /** Start the background scheduler. Idempotent — safe to call multiple times. */
  start(logger: (msg: string, tag?: string) => void): void {
    if (this._started) return;
    this._started = true;

    if (!this.isEnabled) {
      logger(
        'Mara Brain disabled (BRAIN_ENABLED=false or PROCESS_AI_TASKS=false). Set BRAIN_ENABLED=true to enable.',
        'mara-scheduler',
      );
      return;
    }

    // Cross-process advisory lock. TTL = 2.5x cycleIntervalMs so a healthy
    // cycle's heartbeat keeps it owned even if a single cycle runs long,
    // and a crashed holder is reclaimable within roughly one cycle.
    const lockTtlMs = Math.max(60_000, Math.floor(this.cycleIntervalMs * 2.5));
    this._cycleLock = new SingletonLock('brain_cycle', { ttlMs: lockTtlMs });
    if (!this._cycleLock.acquire()) {
      const existing = this._cycleLock.inspect();
      const holderInfo = existing
        ? `holder=${existing.holder}, expires_at=${new Date(existing.expires_at).toISOString()}`
        : 'unknown';
      logger(
        `Brain cycle lock already held by another instance (${holderInfo}). ` +
          'Running in passive mode (no scheduler, no manual triggers, no initial learning).',
        'mara-scheduler',
      );
      this._passive = true;
      return;
    }
    this._cycleLock.startHeartbeat();
    logger(
      `Acquired brain_cycle advisory lock (ttl=${Math.round(lockTtlMs / 1000)}s)`,
      'mara-scheduler',
    );

    // Release the lock when the process is winding down so the next deploy
    // can grab it immediately instead of waiting for the TTL to expire.
    const releaseOnExit = () => {
      try {
        this._cycleLock?.release();
      } catch {
        // best-effort
      }
    };
    process.once('SIGTERM', releaseOnExit);
    process.once('SIGINT', releaseOnExit);
    process.once('beforeExit', releaseOnExit);

    // Fire-and-forget bootstrap
    runInitialLearning().catch((err) => {
      logger(`Initial learning failed: ${err}`, 'mara-brain');
    });

    // First cycle after 30s (give the server time to boot and settle)
    const firstCycleDelay = 30 * 1000;
    this._nextRunAt = Date.now() + firstCycleDelay;

    this._initialTimeout = setTimeout(() => {
      this._initialTimeout = null;
      void this._scheduledCycle(logger);
    }, firstCycleDelay);
    this._cycleTimer = setInterval(
      () => void this._scheduledCycle(logger),
      this.cycleIntervalMs,
    );

    // Self-post scheduler is opt-out via BRAIN_SELF_POST_ENABLED=false. When
    // the brain is on but the user only wants autonomous learning (no auto
    // marketing posts in the creator feed), this flag keeps the cycle but
    // skips the post timer.
    const selfPostMsg = this.isSelfPostEnabled
      ? `, self-post every ${Math.round(this.selfPostIntervalMs / 60000)}min`
      : ', self-post DISABLED (BRAIN_SELF_POST_ENABLED=false)';
    if (this.isSelfPostEnabled) {
      this._selfPostTimer = setInterval(
        () => void this._scheduledSelfPost(logger),
        this.selfPostIntervalMs,
      );
    }

    logger(
      `Mara auto-scheduler started: brain cycle every ${Math.round(this.cycleIntervalMs / 60000)}min${selfPostMsg}`,
      'mara-scheduler',
    );
  }

  /** Stop the scheduler. Used for tests and graceful shutdown. */
  stop(): void {
    if (this._initialTimeout) {
      clearTimeout(this._initialTimeout);
      this._initialTimeout = null;
    }
    if (this._cycleTimer) {
      clearInterval(this._cycleTimer);
      this._cycleTimer = null;
    }
    if (this._selfPostTimer) {
      clearInterval(this._selfPostTimer);
      this._selfPostTimer = null;
    }
    if (this._cycleLock) {
      try {
        this._cycleLock.release();
      } catch {
        // best-effort
      }
      this._cycleLock = null;
    }
    this._passive = false;
    this._started = false;
  }

  /** True if this instance is running but did NOT win the advisory lock. */
  get isPassive(): boolean {
    return this._passive;
  }

  /** Current admin-facing status snapshot. */
  status(): BrainStatus {
    const manualAvail =
      this._lastManualTriggerAt !== null
        ? new Date(this._lastManualTriggerAt + this.manualCooldownMs).toISOString()
        : null;
    return {
      enabled: this.isEnabled,
      running: this._running,
      passive: this._passive,
      startedAt: this._startedAt ? new Date(this._startedAt).toISOString() : null,
      lastRunAt: this._lastRunAt ? new Date(this._lastRunAt).toISOString() : null,
      lastDurationMs: this._lastDurationMs,
      lastError: this._lastError,
      lastKnowledgeLearned: this._lastKnowledgeLearned,
      nextRunAt: this._nextRunAt ? new Date(this._nextRunAt).toISOString() : null,
      cycleIntervalMs: this.cycleIntervalMs,
      selfPostIntervalMs: this.selfPostIntervalMs,
      selfPostEnabled: this.isSelfPostEnabled,
      manualTriggerCooldownMs: this.manualCooldownMs,
      manualTriggerAvailableAt: manualAvail,
    };
  }

  /** Manually trigger a cycle. Returns the trigger outcome for the admin UI. */
  async triggerManual(): Promise<
    | { ok: true; started: true }
    | {
        ok: false;
        reason: 'disabled' | 'running' | 'cooldown' | 'passive';
        retryAfterMs?: number;
      }
  > {
    if (!this.isEnabled) return { ok: false, reason: 'disabled' };
    if (this._passive) return { ok: false, reason: 'passive' };
    if (this._running) return { ok: false, reason: 'running' };

    const now = Date.now();
    if (
      this._lastManualTriggerAt !== null &&
      now - this._lastManualTriggerAt < this.manualCooldownMs
    ) {
      return {
        ok: false,
        reason: 'cooldown',
        retryAfterMs: this.manualCooldownMs - (now - this._lastManualTriggerAt),
      };
    }

    this._lastManualTriggerAt = now;
    // Fire-and-forget — caller gets immediate response; background work continues.
    void this._runCycleInternal(console.log.bind(console, '[mara-manual]'));
    return { ok: true, started: true };
  }

  private async _scheduledCycle(logger: (msg: string, tag?: string) => void): Promise<void> {
    if (!this._started) return; // stop() called before this tick fired
    if (!this.isEnabled) return;
    if (this._passive) return; // another replica owns the lock
    // Heartbeat is best-effort; if we lose the lock mid-cycle the next
    // _runCycleInternal call will be skipped and the new holder takes over.
    if (this._cycleLock && !this._cycleLock.heartbeat()) {
      logger(
        'Lost brain_cycle advisory lock to another instance — switching to passive mode.',
        'mara-scheduler',
      );
      this._passive = true;
      return;
    }
    // Anchor the next-run display to the tick time (now), not to the cycle's
    // completion time. setInterval fires at fixed cadence from start(), so the
    // true next fire is approx. now + cycleIntervalMs regardless of how long
    // this cycle takes to run.
    const tickAt = Date.now();
    this._nextRunAt = tickAt + this.cycleIntervalMs;
    if (this._running) {
      logger('Skipping scheduled cycle — previous cycle still running', 'mara-brain');
      return;
    }
    await this._runCycleInternal(logger);
  }

  private async _runCycleInternal(
    logger: (msg: string, tag?: string) => void,
  ): Promise<void> {
    this._running = true;
    this._startedAt = Date.now();
    this._lastError = null;
    const startedAt = Date.now();
    try {
      logger('Auto brain cycle starting...', 'mara-brain');
      const result = await runBrainCycle();
      // BrainCycleResult fields are already strings (each agent joins with '\n').
      // Keep historic on-disk format: store raw strings, not JSON-encoded strings.
      await storage.createBrainLog({
        research: result.research ?? '',
        productIdeas: result.productIdeas ?? '',
        devTasks: result.devTasks ?? '',
        growthIdeas: result.growthIdeas ?? '',
      });
      this._lastKnowledgeLearned = result.knowledgeLearned ?? 0;
      logger(
        `Auto brain cycle completed. Learned ${result.knowledgeLearned} new pieces of knowledge.`,
        'mara-brain',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = msg;
      logger(`Auto brain cycle failed: ${msg}`, 'mara-brain');
    } finally {
      const endedAt = Date.now();
      this._running = false;
      this._lastRunAt = endedAt;
      this._lastDurationMs = endedAt - startedAt;
      this._startedAt = null;
    }
  }

  private async _scheduledSelfPost(
    logger: (msg: string, tag?: string) => void,
  ): Promise<void> {
    if (!this._started) return;
    if (!this.isEnabled) return;
    try {
      logger('Auto self-marketing post starting...', 'mara-marketing');
      const postContent = await generateMarketingPost();
      await storage.createVideo({
        url: '#',
        type: 'creator',
        title: 'Mara AI Insight',
        description: postContent,
        creatorId: 'mara-ai',
      });
      logger('Auto self-marketing post published', 'mara-marketing');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger(`Auto self-marketing post failed: ${msg}`, 'mara-marketing');
    }
  }
}

export const brainManager = new BrainManagerImpl();
