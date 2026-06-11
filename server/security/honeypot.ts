// Honeypot routes for hellomara.net
// Traps paths that no legitimate user ever requests (WordPress, PHPMyAdmin,
// exposed config files, shells, etc.). Any hit → log event + auto-ban.
//
// GDPR basis: Art. 6(1)(f) legitimate interest — network/information security
// (Recital 49). Data stored: IP, path, method, truncated UA (max 512 chars).
// No request bodies, cookies, or payload content are stored.

import type { Express, Request, Response } from 'express';
import { db } from '../db.js';
import { blacklistedIps, honeypotEvents } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getClientIp, toBlacklistKey } from './client-ip.js';
import { tarpit } from './tarpit.js';

// Ban ladder per offense level (hours). Index = hitCount - 1, capped at last.
function getBanLadder(): number[] {
  const raw = process.env.SECURITY_BAN_LADDER ?? '1,6,24,168';
  const parsed = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
  return parsed.length > 0 ? parsed : [1, 6, 24, 168];
}

function banDurationHours(hitCount: number): number {
  const ladder = getBanLadder();
  const idx = Math.min(hitCount - 1, ladder.length - 1);
  return ladder[idx];
}

// Paths that no legitimate hellomara.net user would ever request.
const HONEYPOT_PATHS = [
  '/wp-admin',
  '/wp-login.php',
  '/xmlrpc.php',
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.git/config',
  '/.git/HEAD',
  '/phpmyadmin',
  '/phpMyAdmin',
  '/admin.php',
  '/config.php',
  '/backup.zip',
  '/backup.sql',
  '/db.sql',
  '/.aws/credentials',
  '/vendor/phpunit',
  '/cgi-bin/',
  '/shell.php',
  '/boaform/admin/formLogin',
  '/telescope',
  '/.DS_Store',
  '/id_rsa',
  '/server-status',
];

async function logAndBan(
  ip: string,
  path: string,
  method: string,
  rawUserAgent: string | undefined,
  isFormHoneypot = false,
): Promise<void> {
  const userAgent = (rawUserAgent ?? '').slice(0, 512);
  const now = Math.floor(Date.now() / 1000);

  // Log honeypot event
  try {
    await db.insert(honeypotEvents).values({ ip, path, method, userAgent });
  } catch {
    // Non-fatal — logging failure must not block response
  }

  try {
    const existing = await db
      .select()
      .from(blacklistedIps)
      .where(eq(blacklistedIps.ip, ip))
      .get();

    if (existing) {
      // Form honeypot caps at 1h regardless of repeat count
      const hours = isFormHoneypot ? 1 : banDurationHours(existing.hitCount + 1);
      const expiresAt = now + hours * 3600;
      await db
        .update(blacklistedIps)
        .set({
          hitCount: existing.hitCount + 1,
          lastSeenAt: now,
          expiresAt,
          reason: `honeypot:${path}`,
        })
        .where(eq(blacklistedIps.ip, ip));
    } else {
      const hours = isFormHoneypot ? 1 : banDurationHours(1);
      const expiresAt = now + hours * 3600;
      await db.insert(blacklistedIps).values({
        ip,
        reason: `honeypot:${path}`,
        hitCount: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        expiresAt,
        permanent: false,
      });
    }
  } catch {
    // Non-fatal — ban failure must not crash the response
  }
}

function honeypotHandler(req: Request, res: Response): void {
  if (process.env.SECURITY_HONEYPOT_ENABLED === 'false') {
    res.status(404).end();
    return;
  }

  const { ip, reliable } = getClientIp(req);
  const key = ip && reliable ? toBlacklistKey(ip) : null;

  if (key) {
    // Fire-and-forget — tarpit starts immediately, DB write runs in background
    logAndBan(key, req.path, req.method, req.headers['user-agent']).catch(() => {});
  }

  tarpit(req, res);
}

export function registerHoneypotRoutes(app: Express): void {
  if (process.env.SECURITY_HONEYPOT_ENABLED === 'false') return;

  for (const path of HONEYPOT_PATHS) {
    app.all(path, honeypotHandler);
    // Also catch sub-paths (e.g. /wp-admin/login)
    if (!path.endsWith('/')) {
      app.all(`${path}/*`, honeypotHandler);
    }
  }

  console.log(`[Security] Honeypot active — ${HONEYPOT_PATHS.length} trap paths registered`);
}

/**
 * Honeypot form field check — call from signup/contact POST handlers.
 * Field name "website" — CSS-hidden from real users, visible to bots.
 * Returns true if the request looks like a bot (field was filled).
 * On bot detection: logs event + applies 1h ban (capped, no escalation).
 */
export async function checkFormHoneypot(req: Request): Promise<boolean> {
  if (process.env.SECURITY_HONEYPOT_ENABLED === 'false') return false;

  const body = req.body as Record<string, unknown>;
  if (!body?.website) return false; // field empty → real user

  const { ip, reliable } = getClientIp(req);
  const key = ip && reliable ? toBlacklistKey(ip) : null;

  if (key) {
    await logAndBan(key, req.path, req.method, req.headers['user-agent'], true);
  }

  return true; // caller should return a fake success to the bot
}
