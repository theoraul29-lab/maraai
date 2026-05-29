/**
 * adminRateLimit — rate limiter IP-based pentru /api/admin/chat.
 *
 * Limite (configurabile prin env vars):
 *   ADMIN_CHAT_RL_MAX    — max request-uri per fereastră (default: 30)
 *   ADMIN_CHAT_RL_WINDOW — fereastra în secunde (default: 60)
 *
 * Storage: în memorie (Map). Pe Railway cu o singură replică e suficient.
 * Pentru multi-replică: înlocuiește Map cu Redis / Drizzle.
 */

import type { Request, Response, NextFunction } from 'express';

const WINDOW_MS = (parseInt(process.env.ADMIN_CHAT_RL_WINDOW || '60', 10)) * 1000;
const MAX_REQUESTS = parseInt(process.env.ADMIN_CHAT_RL_MAX || '30', 10);

// Key: IP address → array of timestamps în fereastra curentă
const ipTimestamps = new Map<string, number[]>();

function getClientIp(req: Request): string {
  // Railway pune IP-ul real în X-Forwarded-For
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function adminRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ip = getClientIp(req);
  const now = Date.now();

  // Curăță timestamp-urile expirate
  let timestamps = (ipTimestamps.get(ip) || []).filter(
    (ts) => now - ts < WINDOW_MS,
  );

  if (timestamps.length >= MAX_REQUESTS) {
    const oldestTs = Math.min(...timestamps);
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - oldestTs)) / 1000);

    res.setHeader('Retry-After', retryAfterSec);
    res.status(429).json({
      message: `Admin chat rate limit: max ${MAX_REQUESTS} requests / ${WINDOW_MS / 1000}s per IP.`,
      retryAfterSec,
    });
    return;
  }

  timestamps.push(now);
  ipTimestamps.set(ip, timestamps);
  next();
}

/** Curăță intrările vechi din Map — apelează periodic dacă vrei să eviți memory leak */
export function cleanupAdminRateLimitCache(): void {
  const now = Date.now();
  for (const [ip, ts] of ipTimestamps.entries()) {
    const fresh = ts.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) ipTimestamps.delete(ip);
    else ipTimestamps.set(ip, fresh);
  }
}
