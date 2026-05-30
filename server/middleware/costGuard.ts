/**
 * costGuard — AI spend protection middleware for /api/maraai/ai/* routes.
 *
 * Limits:
 *   - MAX_AI_REQUESTS_PER_USER_PER_DAY (default 50) — 429 when exceeded
 *   - MAX_TOKENS_PER_REQUEST (default 1000) — 400 when message is too long
 *   - Ollama permanent fallback: after OLLAMA_PERM_FAILURE_THRESHOLD consecutive
 *     failures the provider-router flag `ollama_forced_anthropic` is set in DB.
 *     Reset only via admin endpoint.
 *
 * Logs every request to `ai_usage_log` table (regardless of outcome).
 */

import type { Request, Response, NextFunction } from 'express';
import { rawSqlite } from '../db.js';

const MAX_AI_REQUESTS_PER_DAY = 50;
const MAX_TOKENS_PER_REQUEST = 1000;
const CHARS_PER_TOKEN = 4; // conservative estimate

export const OLLAMA_PERM_FAILURE_THRESHOLD = 3;

rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS ai_usage_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
    message_chars INTEGER NOT NULL DEFAULT 0,
    tokens_estimated INTEGER NOT NULL DEFAULT 0,
    provider TEXT,
    outcome TEXT NOT NULL DEFAULT 'ok',
    date_utc TEXT NOT NULL
  )
`);

rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

rawSqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_date
  ON ai_usage_log (user_id, date_utc)
`);

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function getDailyCount(userId: string): number {
  const row = rawSqlite.prepare(
    `SELECT COUNT(*) as cnt FROM ai_usage_log WHERE user_id = ? AND date_utc = ?`
  ).get(userId, todayUtc()) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

function logRequest(
  userId: string,
  messageChars: number,
  tokensEstimated: number,
  outcome: 'ok' | 'rate_limited' | 'token_exceeded',
  provider?: string,
): void {
  try {
    rawSqlite.prepare(
      `INSERT INTO ai_usage_log (id, user_id, message_chars, tokens_estimated, provider, outcome, date_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      messageChars,
      tokensEstimated,
      provider ?? null,
      outcome,
      todayUtc(),
    );
  } catch {
    // log failure must never break the request
  }
}

export function isOllamaForcedFallback(): boolean {
  try {
    const row = rawSqlite.prepare(
      `SELECT value FROM system_config WHERE key = 'ollama_forced_anthropic'`
    ).get() as { value: string } | undefined;
    return row?.value === 'true';
  } catch {
    return false;
  }
}

export function setOllamaForcedFallback(forced: boolean): void {
  rawSqlite.prepare(
    `INSERT INTO system_config (key, value, updated_at)
     VALUES ('ollama_forced_anthropic', ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`
  ).run(forced ? 'true' : 'false');
}

let consecutiveOllamaFailures = 0;

export function recordOllamaFailure(): void {
  consecutiveOllamaFailures++;
  if (consecutiveOllamaFailures >= OLLAMA_PERM_FAILURE_THRESHOLD && !isOllamaForcedFallback()) {
    setOllamaForcedFallback(true);
    console.warn(
      `[costGuard] Ollama failed ${consecutiveOllamaFailures} times consecutively — ` +
      `permanent Anthropic fallback activated. Reset via admin endpoint.`
    );
  }
}

export function recordOllamaSuccess(): void {
  consecutiveOllamaFailures = 0;
}

export function costGuard(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as any).user?.uid;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  }

  const message: string = req.body?.message ?? '';
  const messageChars = message.length;
  const tokensEstimated = estimateTokens(message);

  if (tokensEstimated > MAX_TOKENS_PER_REQUEST) {
    logRequest(userId, messageChars, tokensEstimated, 'token_exceeded');
    res.status(400).json({
      message: `Mesajul depășește limita de ${MAX_TOKENS_PER_REQUEST} tokeni. Scurtează mesajul.`,
      tokensEstimated,
      maxTokens: MAX_TOKENS_PER_REQUEST,
    });
    return;
  }

  const dailyCount = getDailyCount(userId);
  if (dailyCount >= MAX_AI_REQUESTS_PER_DAY) {
    logRequest(userId, messageChars, tokensEstimated, 'rate_limited');
    res.setHeader('X-RateLimit-Limit', MAX_AI_REQUESTS_PER_DAY);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', Math.floor(new Date().setUTCHours(24, 0, 0, 0) / 1000));
    res.status(429).json({
      message: `Ai atins limita de ${MAX_AI_REQUESTS_PER_DAY} requesturi AI pe zi. Revino mâine.`,
      dailyCount,
      dailyLimit: MAX_AI_REQUESTS_PER_DAY,
    });
    return;
  }

  logRequest(userId, messageChars, tokensEstimated, 'ok');

  res.setHeader('X-RateLimit-Limit', MAX_AI_REQUESTS_PER_DAY);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_AI_REQUESTS_PER_DAY - dailyCount - 1));

  next();
}
