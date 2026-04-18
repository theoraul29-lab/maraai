/**
 * In-process chat rate limiter.
 *
 * Limits each user to RATE_LIMIT_MAX_MESSAGES messages per RATE_LIMIT_WINDOW_MS.
 * State is stored in memory — it resets on server restart, which is acceptable
 * for abuse protection (not billing-critical).  For multi-replica deployments,
 * replace the Map with a shared store (Redis / SQLite).
 */

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 10;

const userMessageTimestamps = new Map<string, number[]>();

export function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let timestamps = userMessageTimestamps.get(userId) || [];

  timestamps = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
    const oldestTimestamp = Math.min(...timestamps);
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldestTimestamp);
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(now);
  userMessageTimestamps.set(userId, timestamps);
  return { allowed: true };
}
