// Mara Learning Rate Limiter — caps Claude calls originating from Mara's autonomous
// cycles (module analyzers + learning queue). Prevents runaway bills if the scheduler
// misbehaves or env misconfig pushes cycle interval to an aggressive value.
//
// Scope: this limiter is ONLY consulted by autonomous Mara agents — user-triggered
// chat is NEVER throttled here. User-facing chat goes through /api/chat directly.
//
// Etapa 2: the daily cap now reads from the persisted ObjectiveFunction
// (mara_core_objective.constraints.maxDailyLLMCalls) so an admin can tune
// it via PUT /api/admin/mara/objective without a redeploy. The env var
// MARA_LEARNING_MAX_CALLS_PER_DAY remains as an *emergency override*
// (e.g. to force-cap to 0 during an incident without touching the DB).

import { getObjective } from '../mara-core/objective.js';

const DEFAULT_MAX_CALLS_PER_DAY = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CallRecord {
  at: number;
  label: string;
}

class LearningRateLimiter {
  private calls: CallRecord[] = [];
  private consecutiveFailures = 0;
  private circuitOpenUntil: number | null = null;

  get maxPerDay(): number {
    // 1. Emergency env-var override — wins so an operator can hard-cap to 0
    //    during an incident without touching the DB. Accepts non-negative
    //    integers (0 = pause autonomous learning entirely).
    const raw = process.env.MARA_LEARNING_MAX_CALLS_PER_DAY;
    if (raw !== undefined && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
    // 2. Persisted ObjectiveFunction.constraints.maxDailyLLMCalls — the
    //    normal admin-tunable value. Wrapped in try/catch because the rate
    //    limiter is in the critical autonomous call path and must never
    //    throw at boot when the DB or objective module is half-loaded.
    try {
      const cap = getObjective().constraints.maxDailyLLMCalls;
      if (Number.isFinite(cap) && cap >= 0) return Math.floor(cap);
    } catch {
      // Fall through to default.
    }
    // 3. Compile-time default.
    return DEFAULT_MAX_CALLS_PER_DAY;
  }

  /** Drop records older than 24h. */
  private purge(): void {
    const cutoff = Date.now() - DAY_MS;
    if (this.calls.length && this.calls[0].at < cutoff) {
      this.calls = this.calls.filter((r) => r.at >= cutoff);
    }
  }

  /** Is the circuit currently open (tripped by repeated failures)? */
  private circuitOpen(): boolean {
    if (this.circuitOpenUntil === null) return false;
    if (Date.now() >= this.circuitOpenUntil) {
      this.circuitOpenUntil = null;
      this.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  /** Reserve a call slot. Returns false if the cap is reached or circuit is open. */
  canCall(): boolean {
    if (this.circuitOpen()) return false;
    this.purge();
    return this.calls.length < this.maxPerDay;
  }

  /** Mark a call as actually made (success). Must be paired with canCall(). */
  recordSuccess(label: string): void {
    this.purge();
    this.calls.push({ at: Date.now(), label });
    this.consecutiveFailures = 0;
  }

  /** Mark a call as failed. 3 consecutive failures open the circuit for 1h. */
  recordFailure(label: string): void {
    this.purge();
    this.calls.push({ at: Date.now(), label });
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 3) {
      this.circuitOpenUntil = Date.now() + 60 * 60 * 1000;
      console.warn(
        `[MaraRateLimiter] Circuit opened for 1h after ${this.consecutiveFailures} consecutive failures`,
      );
    }
  }

  stats(): {
    callsLast24h: number;
    maxPerDay: number;
    remaining: number;
    circuitOpen: boolean;
    circuitOpenUntil: string | null;
  } {
    this.purge();
    return {
      callsLast24h: this.calls.length,
      maxPerDay: this.maxPerDay,
      remaining: Math.max(0, this.maxPerDay - this.calls.length),
      circuitOpen: this.circuitOpen(),
      circuitOpenUntil: this.circuitOpenUntil ? new Date(this.circuitOpenUntil).toISOString() : null,
    };
  }
}

export const learningRateLimiter = new LearningRateLimiter();

/**
 * Wraps an async LLM call so it counts against the daily cap.
 * If the cap is reached or the circuit is open, returns `null` and skips the call.
 */
export async function guardedLLMCall<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (!learningRateLimiter.canCall()) {
    const s = learningRateLimiter.stats();
    console.log(
      `[MaraRateLimiter] Skipped "${label}" — ${s.callsLast24h}/${s.maxPerDay} calls used, circuit=${s.circuitOpen}`,
    );
    return null;
  }
  try {
    const result = await fn();
    learningRateLimiter.recordSuccess(label);
    return result;
  } catch (err) {
    learningRateLimiter.recordFailure(label);
    throw err;
  }
}
