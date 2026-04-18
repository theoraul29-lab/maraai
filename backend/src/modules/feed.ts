/**
 * Unified cross-module feed (PR I).
 *
 * Two endpoints back the "feed" surface of the app:
 *
 *   GET /api/feed              — public discovery stream. Merges approved
 *                                reels and *public+published* writer pages
 *                                from the whole platform, ordered by
 *                                publication time. No auth required.
 *
 *   GET /api/feed/following    — personalised stream. Same shape, but
 *                                restricted to content authored by users
 *                                the caller follows. Requires auth; returns
 *                                401 for anonymous callers and an empty
 *                                list when the caller follows nobody.
 *
 * Visibility rules:
 *   - Reels: only `moderation_status = 'approved'` are surfaced.
 *   - Writer pages: only `published = 1` AND `visibility = 'public'`. VIP
 *     and paid pages are deliberately excluded — those are gated by plan
 *     or purchase on their own read endpoints, not by discovery.
 *
 * Both endpoints accept:
 *   - `limit`  (1..100, default 20)
 *   - `offset` (>=0, default 0)
 *   - `kinds`  comma-separated: `reel`, `writer_page`. Omitted = both.
 */

import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';

let deps: { storage: IStorage };

export function injectDeps(d: typeof deps) {
  deps = d;
}

type Kind = 'reel' | 'writer_page';

function currentUserId(req: Request): string | null {
  const fromSession = (req as unknown as { session?: { userId?: string } })
    .session?.userId;
  if (typeof fromSession === 'string' && fromSession.length > 0) return fromSession;
  const fromPassport = (req.user as { uid?: string } | undefined)?.uid;
  if (typeof fromPassport === 'string' && fromPassport.length > 0) return fromPassport;
  return null;
}

function parsePagination(req: Request): { limit: number; offset: number } {
  const parseNum = (v: unknown, fallback: number) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const limit = Math.min(Math.max(parseNum(req.query.limit, 20), 1), 100);
  const offset = Math.max(parseNum(req.query.offset, 0), 0);
  return { limit, offset };
}

function parseKinds(req: Request): Kind[] | undefined {
  const raw = req.query.kinds;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const out: Kind[] = [];
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (part === 'reel' || part === 'writer_page') {
      if (!out.includes(part)) out.push(part);
    }
  }
  return out.length > 0 ? out : undefined;
}

export async function getUnifiedFeed(req: Request, res: Response) {
  try {
    const { limit, offset } = parsePagination(req);
    const kinds = parseKinds(req);
    const items = await deps.storage.getUnifiedFeed({ limit, offset, kinds });
    res.json({ items, limit, offset });
  } catch (error) {
    console.error('[feed] getUnifiedFeed failed:', error);
    res.status(500).json({ error: 'feed_fetch_failed', code: 'feed_fetch_failed' });
  }
}

export async function getFollowingFeed(req: Request, res: Response) {
  try {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }
    // Reject anonymous session ids: no real users row means the caller is an
    // automatically-assigned visitor, not an actual logged-in user.
    const existing = await deps.storage.getUserById(userId);
    if (!existing) {
      res.status(401).json({ error: 'unauthenticated', code: 'unauthenticated' });
      return;
    }

    const { limit, offset } = parsePagination(req);
    const kinds = parseKinds(req);
    const items = await deps.storage.getFollowingFeed(userId, {
      limit,
      offset,
      kinds,
    });
    res.json({ items, limit, offset });
  } catch (error) {
    console.error('[feed] getFollowingFeed failed:', error);
    res.status(500).json({ error: 'following_feed_failed', code: 'following_feed_failed' });
  }
}
