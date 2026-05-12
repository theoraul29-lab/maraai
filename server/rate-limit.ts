import type { Request, Response, NextFunction } from 'express';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 10;

const userMessageTimestamps = new Map<string, number[]>();

export function checkRateLimit(
  userId: string,
): { allowed: boolean; retryAfterMs?: number } {
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

// Express middleware — identifies the user by session uid, or falls back to IP.
export function chatRateLimit(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.uid || req.ip || 'anonymous';
  const result = checkRateLimit(userId);
  if (!result.allowed) {
    res.setHeader('Retry-After', Math.ceil((result.retryAfterMs ?? RATE_LIMIT_WINDOW_MS) / 1000));
    return res.status(429).json({
      message: 'Too many messages. Please try again in a moment.',
      retryAfterMs: result.retryAfterMs,
    });
  }
  next();
}

// --- Auth rate limiter ---
// 10 attempts per IP per 15 minutes for login/signup endpoints.
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const AUTH_MAX_ATTEMPTS = 10;
const authAttemptTimestamps = new Map<string, number[]>();

export function authRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();

  let timestamps = authAttemptTimestamps.get(ip) || [];
  timestamps = timestamps.filter((ts) => now - ts < AUTH_WINDOW_MS);

  if (timestamps.length >= AUTH_MAX_ATTEMPTS) {
    const oldestTimestamp = Math.min(...timestamps);
    const retryAfterMs = AUTH_WINDOW_MS - (now - oldestTimestamp);
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
    return res.status(429).json({
      code: 'rate_limited',
      message: 'Too many attempts. Please try again later.',
      retryAfterMs,
    });
  }

  timestamps.push(now);
  authAttemptTimestamps.set(ip, timestamps);
  next();
}

// --- Per-route IP rate limiter factory ---
//
// `createIPRateLimit({ name, max, windowMs })` returns an Express middleware
// that keeps a per-IP sliding window for THIS named bucket only. Different
// names get separate maps, so signup attempts don't share a bucket with
// login attempts.
//
// Usage:
//   app.post('/api/auth/signup',
//     createIPRateLimit({ name: 'auth:signup', max: 5, windowMs: 15*60*1000 }),
//     authSignup);
//
// Notes:
//   - Only POSTs are rate-limited; the middleware passes any other method
//     straight through so GETs (route prefetch, health checks, asset loads
//     sharing the same path) are never throttled.
//   - The middleware NEVER throws. On internal failure it logs and calls
//     `next()` so a buggy limiter cannot take down auth.
//   - Counters live in-memory, per process. On Railway's single-instance
//     deployment that is enough. If we scale horizontally the limits become
//     per-instance — note this as a known limitation, not a regression.
const rateLimitBuckets = new Map<string, Map<string, number[]>>();

export type IPRateLimitOptions = {
  name: string;
  max: number;
  windowMs: number;
};

export function createIPRateLimit(opts: IPRateLimitOptions) {
  if (!rateLimitBuckets.has(opts.name)) {
    rateLimitBuckets.set(opts.name, new Map<string, number[]>());
  }
  const bucket = rateLimitBuckets.get(opts.name)!;
  const { max, windowMs } = opts;

  return function ipRateLimit(req: Request, res: Response, next: NextFunction) {
    try {
      // Only rate-limit mutating requests on these auth/OTP routes. GETs
      // are typically asset/route lookups and shouldn't share the bucket.
      if (req.method !== 'POST') {
        return next();
      }

      const ip = req.ip || 'unknown';
      const now = Date.now();
      let timestamps = bucket.get(ip) || [];
      timestamps = timestamps.filter((ts) => now - ts < windowMs);

      if (timestamps.length >= max) {
        const oldestTimestamp = Math.min(...timestamps);
        const retryAfterMs = windowMs - (now - oldestTimestamp);
        res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
        return res.status(429).json({
          message: 'Too many requests. Please try again later.',
          retryAfterMs,
        });
      }

      timestamps.push(now);
      bucket.set(ip, timestamps);
      return next();
    } catch (err) {
      // Defensive: never let a bug in the limiter break the request.
      console.error(`[rate-limit:${opts.name}] middleware error:`, err);
      return next();
    }
  };
}

// Conventional 15-minute windows. Tunable via env to keep ops flexible.
const FIFTEEN_MIN = 15 * 60 * 1000;
function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Pre-configured per-route rate limiters for the auth surface.
 *
 *   signup        →  5 / IP / 15 min
 *   login         → 10 / IP / 15 min
 *   request-reset →  3 / IP / 15 min  (anti-spam on transactional mail)
 *   confirm-reset →  3 / IP / 15 min  (anti-brute on reset tokens)
 *   otp           →  3 / IP / 15 min  (anti-spam on transactional mail)
 *
 * Tunable via env:
 *   AUTH_RL_SIGNUP_MAX, AUTH_RL_LOGIN_MAX, AUTH_RL_RESET_MAX, AUTH_RL_OTP_MAX
 */
export const signupRateLimit = createIPRateLimit({
  name: 'auth:signup',
  max: envInt('AUTH_RL_SIGNUP_MAX', 5),
  windowMs: FIFTEEN_MIN,
});

export const loginRateLimit = createIPRateLimit({
  name: 'auth:login',
  max: envInt('AUTH_RL_LOGIN_MAX', 10),
  windowMs: FIFTEEN_MIN,
});

export const requestResetRateLimit = createIPRateLimit({
  name: 'auth:request-reset',
  max: envInt('AUTH_RL_RESET_MAX', 3),
  windowMs: FIFTEEN_MIN,
});

export const confirmResetRateLimit = createIPRateLimit({
  name: 'auth:confirm-reset',
  max: envInt('AUTH_RL_RESET_MAX', 3),
  windowMs: FIFTEEN_MIN,
});

export const otpRateLimit = createIPRateLimit({
  name: 'auth:otp',
  max: envInt('AUTH_RL_OTP_MAX', 3),
  windowMs: FIFTEEN_MIN,
});
