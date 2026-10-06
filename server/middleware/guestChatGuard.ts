/**
 * guestChatGuard — server-side enforcement for the Mara-first anonymous
 * "talk before you sign up" flow (POST /api/chat/guest).
 *
 * Reuses the existing `ai_usage_log` table (server/middleware/costGuard.ts)
 * rather than a new one, but with a true rolling window (`requested_at` is
 * already unixepoch seconds) instead of costGuard's own UTC-calendar-day
 * bucket, which would otherwise let a guest get a free reset right at UTC
 * midnight.
 *
 * Two layers:
 *   1. Primary: per-session guest uid, hard cap of MAX_GUEST_MESSAGES within
 *      GUEST_WINDOW_SECONDS. This is the real "2-3 messages" limit.
 *   2. Secondary, looser: per-IP-hash cap. A visitor who clears cookies or
 *      opens an incognito window gets a fresh session uid, so layer 1 alone
 *      resets — this layer raises the bar (does not eliminate it) by also
 *      capping total guest requests from the same IP. Only a hash is
 *      stored, never the raw IP, matching the existing waitlist pattern
 *      (server/modules/launch-countdown.ts's hashIp) and the Privacy
 *      Policy's "we do not permanently store your IP address" claim.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { rawSqlite } from '../db.js';

export const MAX_GUEST_MESSAGES = 3;
const GUEST_WINDOW_SECONDS = 24 * 60 * 60;
const MAX_GUEST_MESSAGES_PER_IP = 15;
const CHARS_PER_TOKEN = 4;

function hashIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function windowStart(): number {
  return Math.floor(Date.now() / 1000) - GUEST_WINDOW_SECONDS;
}

function countSince(column: 'user_id' | 'ip_hash', value: string, since: number): number {
  const row = rawSqlite
    .prepare(`SELECT COUNT(*) as cnt FROM ai_usage_log WHERE ${column} = ? AND requested_at >= ?`)
    .get(value, since) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

function oldestRequestAt(column: 'user_id' | 'ip_hash', value: string, since: number): number | null {
  const row = rawSqlite
    .prepare(`SELECT MIN(requested_at) as t FROM ai_usage_log WHERE ${column} = ? AND requested_at >= ?`)
    .get(value, since) as { t: number | null } | undefined;
  return row?.t ?? null;
}

function logGuestRequest(
  guestUserId: string,
  ipHash: string | null,
  messageChars: number,
  outcome: 'ok' | 'rate_limited',
): void {
  try {
    rawSqlite
      .prepare(
        `INSERT INTO ai_usage_log (id, user_id, message_chars, tokens_estimated, provider, outcome, date_utc, ip_hash)
         VALUES (?, ?, ?, ?, 'guest', ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        guestUserId,
        messageChars,
        Math.ceil(messageChars / CHARS_PER_TOKEN),
        outcome,
        new Date().toISOString().slice(0, 10),
        ipHash,
      );
  } catch {
    // Logging failure must never break the request — same contract as
    // costGuard.ts's own logRequest().
  }
}

export interface GuestLimitStatus {
  remaining: number;
  limit: number;
  resetsAt: string | null;
}

/** Read-only status check — used by the handler to report remaining count. */
export function guestMessagesRemaining(guestUserId: string): GuestLimitStatus {
  const since = windowStart();
  const used = countSince('user_id', guestUserId, since);
  const oldest = oldestRequestAt('user_id', guestUserId, since);
  return {
    remaining: Math.max(0, MAX_GUEST_MESSAGES - used),
    limit: MAX_GUEST_MESSAGES,
    resetsAt: oldest ? new Date((oldest + GUEST_WINDOW_SECONDS) * 1000).toISOString() : null,
  };
}

export function guestChatGuard(req: Request, res: Response, next: NextFunction): void {
  const guestUserId: string | undefined = (req as any).user?.uid;
  if (!guestUserId) {
    res.status(401).json({ message: 'No session.' });
    return;
  }

  const message: string = req.body?.message ?? '';
  const messageChars = message.length;
  const ipHash = hashIp(req.ip);
  const since = windowStart();

  const usedBySession = countSince('user_id', guestUserId, since);
  if (usedBySession >= MAX_GUEST_MESSAGES) {
    logGuestRequest(guestUserId, ipHash, messageChars, 'rate_limited');
    const status = guestMessagesRemaining(guestUserId);
    res.status(429).json({
      code: 'guest_limit',
      message: "You've used your free preview messages with Mara. Create a free account to keep going — I'll remember where we left off.",
      limit: MAX_GUEST_MESSAGES,
      resetsAt: status.resetsAt,
    });
    return;
  }

  if (ipHash) {
    const usedByIp = countSince('ip_hash', ipHash, since);
    if (usedByIp >= MAX_GUEST_MESSAGES_PER_IP) {
      logGuestRequest(guestUserId, ipHash, messageChars, 'rate_limited');
      res.status(429).json({
        code: 'guest_limit_network',
        message: 'Too many preview conversations from this network recently. Please sign in to continue.',
      });
      return;
    }
  }

  logGuestRequest(guestUserId, ipHash, messageChars, 'ok');
  next();
}
