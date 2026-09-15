/**
 * Optional, Control-Center-settable Anthropic API key.
 *
 * Ollama is the primary provider; Anthropic is now an optional fallback the
 * operator can wire up later without touching Railway env vars. The key is
 * stored encrypted (AES-256-GCM, keyed off SESSION_SECRET) in the same
 * `system_config` table costGuard already uses for small operational flags —
 * never returned in plaintext by any API response once saved.
 *
 * Precedence: `ANTHROPIC_API_KEY` env var (if an operator set it directly on
 * Railway) wins; otherwise this DB-stored override is used.
 */

import crypto from 'node:crypto';
import { rawSqlite } from '../db.js';

const CONFIG_KEY = 'anthropic_api_key_override';

rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

function getEncryptionKey(): Buffer {
  // SESSION_SECRET is required in production (server/index.ts refuses to
  // boot without it) and is not rotated casually, so it's a reasonable
  // at-rest encryption key for this without introducing a new secret.
  const secret = process.env.SESSION_SECRET || 'dev-only-insecure-key-do-not-use-in-production';
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(payload: string): string | null {
  try {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    // Wrong/rotated SESSION_SECRET, or corrupted value — treat as absent
    // rather than crashing the AI request path.
    return null;
  }
}

export function getAnthropicApiKeyOverride(): string | null {
  try {
    const row = rawSqlite.prepare(`SELECT value FROM system_config WHERE key = ?`).get(CONFIG_KEY) as
      | { value: string }
      | undefined;
    if (!row?.value) return null;
    return decrypt(row.value);
  } catch {
    return null;
  }
}

export function setAnthropicApiKeyOverride(apiKey: string | null): void {
  if (!apiKey || !apiKey.trim()) {
    rawSqlite.prepare(`DELETE FROM system_config WHERE key = ?`).run(CONFIG_KEY);
    return;
  }
  const encrypted = encrypt(apiKey.trim());
  rawSqlite
    .prepare(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    )
    .run(CONFIG_KEY, encrypted);
}

export function hasAnthropicApiKeyOverride(): boolean {
  try {
    const row = rawSqlite.prepare(`SELECT 1 FROM system_config WHERE key = ?`).get(CONFIG_KEY);
    return !!row;
  } catch {
    return false;
  }
}

/** The key the app should actually use: env var first, DB override second. */
export function getEffectiveAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || getAnthropicApiKeyOverride() || undefined;
}
