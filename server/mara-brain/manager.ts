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
import { cleanupKnowledgeBase } from './knowledge-base.js';
import { decayAllToxicity } from './memory.js';
import { ensureAlertsTable, analyzePlatformAndAlert } from './alerts.js';
import { db, rawSqlite } from '../db.js';
import { ensureSessionTable } from './session-state.js';
import { pushSubscriptions } from '../../shared/schema.js';
import { sendToUser } from '../push/vapid.js';
import { subscribeEvent, publishEvent } from '../maraai/kafka.js';

export const BRAIN_EVENT_TOPIC = 'brain.event';
export type BrainEventType = 'signup_spike' | 'experiment_completed' | 'engagement_drop' | 'feedback_negative';

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

// Defaults — overridable via env.
// Respiro between consecutive cycles: 10 min by default.
// Override via BRAIN_RESPIRO_MS env var.
const DEFAULT_RESPIRO_MS = 10 * 60 * 1000; // 10min
const DEFAULT_SELF_POST_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4h
const DEFAULT_MANUAL_COOLDOWN_MS = 5 * 60 * 1000; // 5min between manual triggers

// Legacy BRAIN_CYCLE_INTERVAL_MS is kept as an alias for BRAIN_RESPIRO_MS so
// existing Railway env vars keep working without a config change.


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
  private _dailyNotifTimer: NodeJS.Timeout | null = null;
  private _lastNotifDay: number | null = null;
  private _initialTimeout: NodeJS.Timeout | null = null;
  private _started = false;
  private _lastEventTriggerAt: number | null = null;
  private readonly EVENT_TRIGGER_COOLDOWN_MS = 30 * 60 * 1000; // 30min between event-triggered cycles
  // Cross-process advisory lock — prevents two instances (e.g. during a
  // Railway rolling deploy) from running brain cycles in parallel against
  // the same database. Lazily created in start() so unit tests can mock
  // the DB before instantiation.
  private _cycleLock: SingletonLock | null = null;
  private _passive = false; // true if we lost the lock at boot

  /** Pause between consecutive cycles (replaces the old "cycle interval"). */
  get respiroMs(): number {
    return parseIntervalMs(
      process.env.BRAIN_RESPIRO_MS ?? process.env.BRAIN_CYCLE_INTERVAL_MS,
      DEFAULT_RESPIRO_MS,
    );
  }

  /** Kept for the status shape — reports respiroMs as cycleIntervalMs. */
  get cycleIntervalMs(): number {
    return this.respiroMs;
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

    // Ensure supporting tables exist before any cycle fires.
    try { ensureAlertsTable(); } catch (err) {
      logger(`ensureAlertsTable failed (non-fatal): ${(err as Error).message}`, 'mara-scheduler');
    }
    try { ensureSessionTable(); } catch (err) {
      logger(`ensureSessionTable failed (non-fatal): ${(err as Error).message}`, 'mara-scheduler');
    }

    // Release the lock when the process is winding down so the next deploy
    // can grab it immediately instead of waiting for the TTL to expire.
    const releaseOnExit = () => {
      try {
        this._cycleLock?.release();
      } catch (err) {
        console.warn(
          '[manager:143] Non-critical error swallowed:',
          err instanceof Error ? err.message : err,
        );
      }
    };
    process.once('SIGTERM', releaseOnExit);
    process.once('SIGINT', releaseOnExit);
    process.once('beforeExit', releaseOnExit);

    // Fire-and-forget bootstrap
    runInitialLearning().catch((err) => {
      logger(`Initial learning failed: ${err}`, 'mara-brain');
    });

    // Code visibility (Item 3): scan the repo's source files in the
    // background so Mara's self-improvement phase can ground its
    // hypotheses in actual code. Runs out-of-band — if it fails (e.g.
    // file permissions in some hosting env), the brain continues
    // normally and the rest of the cycle just doesn't get code context.
    // Lazy import to keep the manager module's startup cost small.
    void (async () => {
      try {
        const { indexCode } = await import('./agents/code-explorer.js');
        const summary = await indexCode();
        logger(
          `code-explorer indexed ${summary.indexed}/${summary.scanned} files (skipped ${summary.skipped}) in ${summary.durationMs}ms`,
          'mara-brain',
        );
      } catch (err) {
        logger(`code-explorer index failed: ${(err as Error).message}`, 'mara-brain');
      }
    })();

    // Determine initial delay:
    //   - First-ever startup (no brain_logs): 60s warmup.
    //   - Subsequent restarts: 30s to let server settle, then run immediately.
    // After the first cycle, the chain schedules the next one with respiroMs pause.
    let hasRunBefore = false;
    try {
      const row = rawSqlite
        .prepare('SELECT COUNT(*) as cnt FROM brain_logs')
        .get() as { cnt: number } | undefined;
      hasRunBefore = (row?.cnt ?? 0) > 0;
    } catch { /* table may not exist yet on very first deploy */ }

    const bootDelayMs = hasRunBefore ? 30_000 : 60_000;
    this._nextRunAt = Date.now() + bootDelayMs;

    if (!hasRunBefore) {
      logger('First-ever brain run — warmup in 60s, then continuous with 10min respiro', 'mara-scheduler');
    } else {
      logger(`Continuing brain from previous session — first cycle in 30s, then continuous with ${Math.round(this.respiroMs / 60000)}min respiro`, 'mara-scheduler');
    }

    // Kick off the continuous chain. Each completed cycle schedules the next
    // one after respiroMs. No setInterval — the chain drives itself.
    this._cycleTimer = setTimeout(() => {
      this._cycleTimer = null;
      void this._runCycleAndScheduleNext(logger);
    }, bootDelayMs);

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

    // Daily mission push notifications — check every 30 min, fire at 9 AM
    this._dailyNotifTimer = setInterval(
      () => void this._checkDailyMissionNotif(logger),
      30 * 60 * 1000,
    );

    // Subscribe to platform events — signup spike, experiment completed, etc.
    subscribeEvent(BRAIN_EVENT_TOPIC, (payload) => {
      const reason = (payload.reason as BrainEventType) ?? 'signup_spike';
      this.triggerOnEvent(reason, logger);
    });

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
      clearTimeout(this._cycleTimer); // chain uses setTimeout, not setInterval
      this._cycleTimer = null;
    }
    if (this._selfPostTimer) {
      clearInterval(this._selfPostTimer);
      this._selfPostTimer = null;
    }
    if (this._dailyNotifTimer) {
      clearInterval(this._dailyNotifTimer);
      this._dailyNotifTimer = null;
    }
    if (this._cycleLock) {
      try {
        this._cycleLock.release();
      } catch (err) {
        console.warn(
          '[manager:225] Non-critical error swallowed:',
          err instanceof Error ? err.message : err,
        );
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

  /** Trigger a brain cycle in response to a platform event (e.g. signup spike). */
  triggerOnEvent(reason: BrainEventType, logger?: (msg: string, tag?: string) => void): void {
    if (!this.isEnabled || this._passive || this._running) return;
    const now = Date.now();
    if (this._lastEventTriggerAt !== null && now - this._lastEventTriggerAt < this.EVENT_TRIGGER_COOLDOWN_MS) return;
    this._lastEventTriggerAt = now;
    const log = logger ?? console.log.bind(console, '[mara-event]');
    log(`Event-triggered brain cycle: ${reason}`, 'mara-brain');
    void this._runCycleInternal(log);
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

  /** Run one cycle then schedule the next after respiroMs. The chain that keeps the brain alive. */
  private async _runCycleAndScheduleNext(logger: (msg: string, tag?: string) => void): Promise<void> {
    if (!this._started || !this.isEnabled || this._passive) return;

    // Heartbeat — if we lost the advisory lock, go passive and stop the chain.
    if (this._cycleLock && !this._cycleLock.heartbeat()) {
      logger('Lost brain_cycle advisory lock — switching to passive mode.', 'mara-scheduler');
      this._passive = true;
      if (this._selfPostTimer) {
        clearInterval(this._selfPostTimer);
        this._selfPostTimer = null;
      }
      return;
    }

    if (!this._running) {
      await this._runCycleInternal(logger);
    }

    // Schedule next cycle after respiro, unless stop() was called.
    if (this._started && !this._passive && this.isEnabled) {
      const respiro = this.respiroMs;
      this._nextRunAt = Date.now() + respiro;
      logger(`🛌 Respiro ${Math.round(respiro / 60000)}min — next cycle at ${new Date(this._nextRunAt).toISOString()}`, 'mara-scheduler');
      this._cycleTimer = setTimeout(() => {
        this._cycleTimer = null;
        void this._runCycleAndScheduleNext(logger);
      }, respiro);
    }
  }

  private async _scheduledCycle(logger: (msg: string, tag?: string) => void): Promise<void> {
    // Kept for event-triggered and manual paths that call _scheduledCycle directly.
    if (!this._started || !this.isEnabled || this._passive) return;
    if (this._running) {
      logger('Skipping cycle — previous cycle still running', 'mara-brain');
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

      // Post-cycle housekeeping (non-blocking — failures don't fail the cycle)
      try { decayAllToxicity(); } catch { /* non-fatal */ }
      try {
        const { deleted } = cleanupKnowledgeBase();
        if (deleted > 0) logger(`KB cleanup removed ${deleted} old entries.`, 'mara-brain');
      } catch { /* non-fatal */ }
      try { await analyzePlatformAndAlert(); } catch { /* non-fatal */ }
      // Check if any experiments have been running 7+ days and need measurement
      try {
        const { rawSqlite: db2 } = await import('../db.js');
        const pending = (db2 as typeof import('../db.js').rawSqlite)
          .prepare(`SELECT COUNT(*) as cnt FROM mara_growth_experiments WHERE status='implemented' AND created_at < unixepoch()-604800`)
          .get() as { cnt: number } | undefined;
        if ((pending?.cnt ?? 0) > 0) {
          void publishEvent(BRAIN_EVENT_TOPIC, { reason: 'experiment_completed' }, {});
        }
      } catch { /* non-fatal */ }
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

  private async _checkDailyMissionNotif(logger: (msg: string, tag?: string) => void): Promise<void> {
    if (!this._started || this._passive) return;
    const now = new Date();
    const hour = now.getHours();
    if (hour < 8 || hour > 10) return;
    const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    if (this._lastNotifDay === today) return;
    this._lastNotifDay = today;
    try {
      const rows = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
      let sent = 0;
      for (const row of rows) {
        try {
          await sendToUser(row.userId, {
            title: '🎯 Misiunea ta de azi te așteaptă!',
            body: 'Mara a pregătit o misiune specială pentru tine. Durează 5 minute.',
            url: '/missions',
            icon: '/icons/icon-192.png',
            tag: 'daily-mission',
          });
          sent += 1;
        } catch { /* per-user failures are non-fatal */ }
      }
      logger(`Daily mission push sent to ${sent}/${rows.length} users`, 'mara-push');
    } catch (err) {
      logger(`Daily mission push failed: ${(err as Error).message}`, 'mara-push');
    }
  }

  private async _scheduledSelfPost(
    logger: (msg: string, tag?: string) => void,
  ): Promise<void> {
    if (!this._started) return;
    if (!this.isEnabled) return;
    // A demoted instance must not keep publishing marketing posts — the
    // new active holder is already doing it and we'd end up with
    // duplicates in the creator feed. _scheduledCycle clears
    // _selfPostTimer when it discovers the lock was lost, but a stale
    // tick can still fire between the lock loss and the clearInterval
    // call. This guard catches that window.
    if (this._passive) return;
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
