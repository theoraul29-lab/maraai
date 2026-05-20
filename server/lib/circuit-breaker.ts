/**
 * Per-provider in-memory circuit breaker.
 * After failureThreshold failures, the circuit opens for cooldownMs.
 * After cooldown, one probe is allowed (half-open); success closes it.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStatus {
  provider: string;
  state: CircuitState;
  failures: number;
  lastFailureAt: number | null;
  openUntil: number | null;
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureAt: number | null = null;
  private openUntil: number | null = null;

  constructor(
    public readonly provider: string,
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  isAvailable(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (this.openUntil !== null && Date.now() >= this.openUntil) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    return true; // half-open: let one probe through
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = null;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.lastFailureAt = Date.now();
    this.failures++;
    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openUntil = Date.now() + this.cooldownMs;
    }
  }

  status(): CircuitBreakerStatus {
    return {
      provider: this.provider,
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
      openUntil: this.openUntil,
    };
  }
}

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000; // 1 minute

const breakers = new Map<string, CircuitBreaker>();

function getBreaker(provider: string): CircuitBreaker {
  if (!breakers.has(provider)) {
    breakers.set(provider, new CircuitBreaker(provider, FAILURE_THRESHOLD, COOLDOWN_MS));
  }
  return breakers.get(provider)!;
}

export function circuitIsAvailable(provider: string): boolean {
  return getBreaker(provider).isAvailable();
}

export function circuitRecordSuccess(provider: string): void {
  getBreaker(provider).recordSuccess();
}

export function circuitRecordFailure(provider: string): void {
  getBreaker(provider).recordFailure();
}

export function getAllCircuitStatuses(): CircuitBreakerStatus[] {
  // Always return both providers so the dashboard shows them even before first use
  for (const p of ['ollama', 'anthropic']) getBreaker(p);
  return Array.from(breakers.values()).map((b) => b.status());
}
