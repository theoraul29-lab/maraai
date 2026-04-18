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
