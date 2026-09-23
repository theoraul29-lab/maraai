/**
 * Optional, Control-Center-settable voice/TTS API key — scaffolding for the
 * Public Library's "listen to book" feature. The library-tts on/off switch
 * (server/modules/library.ts's isLibraryTtsActive/setLibraryTtsActive)
 * stays off regardless of whether a key is saved here; this only exists so
 * the credential has somewhere safe to live once a provider is chosen. No
 * specific provider is wired up yet — each one (ElevenLabs, Google, Azure,
 * etc.) has its own request/response shape, so the actual "generate audio
 * from book text" call is deliberately not implemented here. Mirrors
 * anthropic-key-store.ts exactly (same AES-256-GCM-via-HKDF approach, same
 * system_config table) but keyed and derived independently, so this key
 * shares no material with that one.
 */

import crypto from 'node:crypto';
import { rawSqlite } from '../db.js';

const CONFIG_KEY = 'voice_api_key_override';

// Also created independently by costGuard.ts / anthropic-key-store.ts on
// their own imports — all `IF NOT EXISTS` against the identical schema, so
// whichever module loads first wins and the others are harmless no-ops.
rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || 'dev-only-insecure-key-do-not-use-in-production';
  const derived = crypto.hkdfSync(
    'sha256',
    secret,
    Buffer.alloc(0),
    'maraai:voice-key-store:v1',
    32,
  );
  return Buffer.from(derived);
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
    // Wrong/rotated SESSION_SECRET, or corrupted value — treat as absent.
    return null;
  }
}

export function getVoiceApiKeyOverride(): string | null {
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

export function setVoiceApiKeyOverride(apiKey: string | null): void {
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

export function hasVoiceApiKeyOverride(): boolean {
  try {
    const row = rawSqlite.prepare(`SELECT 1 FROM system_config WHERE key = ?`).get(CONFIG_KEY);
    return !!row;
  } catch {
    return false;
  }
}

/** The key a future provider integration should actually use: env var first, DB override second. */
export function getEffectiveVoiceApiKey(): string | undefined {
  return process.env.VOICE_API_KEY || getVoiceApiKeyOverride() || undefined;
}
