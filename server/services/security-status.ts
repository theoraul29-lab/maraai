import { rawSqlite } from '../db.js';
import { getAllCircuitStatuses, type CircuitBreakerStatus } from '../lib/circuit-breaker.js';
import { controlTaskWorkerStatus } from '../bootstrap/control-task-worker.js';

export interface SecuritySnapshot {
  blacklistedIps: {
    total: number;
    recent: Array<{ ip: string; reason: string; hitCount: number; permanent: boolean; expiresAt: number }>;
  };
  honeypot: {
    eventsLast24h: number;
    recent: Array<{ ip: string; path: string; method: string; createdAt: number }>;
  };
  circuits: CircuitBreakerStatus[];
  controlWorker: ReturnType<typeof controlTaskWorkerStatus>;
  generatedAt: string;
}

/**
 * Read-only security posture for Control Center's Security Agent panel.
 * Mirrors repository-status.ts / integration-status.ts: a direct synchronous
 * read, no task queue, no LLM call — the Security Agent's job today is
 * visibility, not autonomous action.
 */
export function readSecuritySnapshot(): SecuritySnapshot {
  const total = (rawSqlite.prepare(`SELECT COUNT(*) as n FROM blacklisted_ips`).get() as { n: number }).n;
  const recentBans = rawSqlite.prepare(
    `SELECT ip, reason, hit_count as hitCount, permanent, expires_at as expiresAt
     FROM blacklisted_ips ORDER BY last_seen_at DESC LIMIT 10`
  ).all() as SecuritySnapshot['blacklistedIps']['recent'];

  const dayAgo = Math.floor(Date.now() / 1000) - 86_400;
  const eventsLast24h = (rawSqlite.prepare(
    `SELECT COUNT(*) as n FROM honeypot_events WHERE created_at >= ?`
  ).get(dayAgo) as { n: number }).n;
  const recentHits = rawSqlite.prepare(
    `SELECT ip, path, method, created_at as createdAt FROM honeypot_events ORDER BY created_at DESC LIMIT 10`
  ).all() as SecuritySnapshot['honeypot']['recent'];

  return {
    blacklistedIps: { total, recent: recentBans },
    honeypot: { eventsLast24h, recent: recentHits },
    circuits: getAllCircuitStatuses(),
    controlWorker: controlTaskWorkerStatus(),
    generatedAt: new Date().toISOString(),
  };
}
