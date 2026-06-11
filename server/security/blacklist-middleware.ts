// Blacklist middleware — checks every request against the IP blacklist.
// In-memory LRU cache (max 10k, TTL 60s) sits in front of SQLite so the DB
// is not hit on every request.
// Never blocks: health checks, Stripe/Resend webhooks, allowlisted IPs.

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';
import { blacklistedIps } from '../../shared/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { getClientIp, toBlacklistKey } from './client-ip.js';
import { tarpit } from './tarpit.js';

// ── LRU cache ────────────────────────────────────────────────────────────────
const CACHE_MAX = 10_000;
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  blocked: boolean;
  permanent: boolean;
  expiresAt: number; // unix seconds from DB
  cachedAt: number;  // Date.now()
}

// Map insertion order = LRU (oldest first when we trim)
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cache.size >= CACHE_MAX) {
    // Evict oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, entry);
}

// ── Never-block list ─────────────────────────────────────────────────────────
const NEVER_BLOCK_PATHS = new Set([
  '/api/health',
  '/api/health/db',
  '/api/runtime',
  '/api/webhooks/stripe',
  '/api/webhooks/resend',
  '/api/payments/stripe', // Stripe sends to this path in some configs
]);

function getAllowlistIps(): Set<string> {
  const raw = process.env.SECURITY_IP_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// ── DB lookup ────────────────────────────────────────────────────────────────
async function isBlacklisted(ip: string): Promise<CacheEntry> {
  const cached = cacheGet(ip);
  if (cached !== undefined) return cached;

  const nowSec = Math.floor(Date.now() / 1000);

  try {
    const row = await db
      .select({
        expiresAt: blacklistedIps.expiresAt,
        permanent: blacklistedIps.permanent,
      })
      .from(blacklistedIps)
      .where(eq(blacklistedIps.ip, ip))
      .get();

    if (!row) {
      const entry: CacheEntry = { blocked: false, permanent: false, expiresAt: 0, cachedAt: Date.now() };
      cacheSet(ip, entry);
      return entry;
    }

    const blocked = row.permanent || row.expiresAt > nowSec;
    const entry: CacheEntry = {
      blocked,
      permanent: row.permanent,
      expiresAt: row.expiresAt,
      cachedAt: Date.now(),
    };
    cacheSet(ip, entry);
    return entry;
  } catch {
    // On DB error, fail open — never accidentally block legitimate users
    return { blocked: false, permanent: false, expiresAt: 0, cachedAt: Date.now() };
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
export function blacklistMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (process.env.SECURITY_HONEYPOT_ENABLED === 'false') {
    next();
    return;
  }

  // Never block health / webhook paths
  if (NEVER_BLOCK_PATHS.has(req.path)) {
    next();
    return;
  }

  const { ip, reliable } = getClientIp(req);
  if (!ip || !reliable) {
    next();
    return;
  }

  const key = toBlacklistKey(ip);

  // Never block allowlisted IPs
  if (getAllowlistIps().has(ip) || getAllowlistIps().has(key)) {
    next();
    return;
  }

  isBlacklisted(key).then((entry) => {
    if (!entry.blocked) {
      next();
      return;
    }
    // IP is banned — tarpit (or instant 403 when tarpit cap is full)
    tarpit(req, res);
  }).catch(() => next());
}

/** Invalidate a cached entry (call after manual ban/unban via admin API). */
export function invalidateBlacklistCache(ip: string): void {
  cache.delete(ip);
  cache.delete(toBlacklistKey(ip));
}
