// Hourly cleanup job:
// 1. Deletes expired blacklist entries (lazy + scheduled sweep)
// 2. Purges honeypot_events older than 30 days (GDPR data minimization)

import { db } from '../db.js';
import { blacklistedIps, honeypotEvents } from '../../shared/schema.js';
import { lt, and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

async function runCleanup(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  try {
    // Delete non-permanent expired bans
    await db
      .delete(blacklistedIps)
      .where(
        and(
          eq(blacklistedIps.permanent, false),
          lt(blacklistedIps.expiresAt, now),
        ),
      );
  } catch (err) {
    console.warn('[Security] Cleanup: failed to purge expired bans:', err);
  }

  try {
    // Delete honeypot events older than 30 days (GDPR retention limit)
    const cutoff = now - THIRTY_DAYS_S;
    await db
      .delete(honeypotEvents)
      .where(lt(honeypotEvents.createdAt, cutoff));
  } catch (err) {
    console.warn('[Security] Cleanup: failed to purge old honeypot events:', err);
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startSecurityCleanup(): void {
  if (cleanupTimer) return;
  // Run immediately on startup, then every hour
  runCleanup().catch(() => {});
  cleanupTimer = setInterval(() => {
    runCleanup().catch(() => {});
  }, 60 * 60 * 1000);
}

export function stopSecurityCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
