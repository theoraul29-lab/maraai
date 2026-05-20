// Universal content share endpoint.
//
// Why this file exists
// --------------------
// Before the audit, every module (missions, reels, posts, articles, profiles)
// owned its own `share` POST. Each one had a slightly different XP rule, a
// different dedup window, and a different URL builder, which made it hard to
// reason about the total XP a user could earn per day and which platforms
// were actually wired up.
//
// `/api/share` is the single source of truth. It:
//   1. Builds an internal share URL (`/<module>/<id>` so the SPA can deep-link)
//   2. Builds the platform-specific external URL when applicable
//      (X intent, WhatsApp wa.me, Telegram t.me, copy-link, …)
//   3. Inserts a row in `content_shares` with all attribution columns
//   4. Awards a flat +25 XP through the missions XP system (which already
//      handles streak multipliers atomically)
//   5. Refuses duplicate (user, source, platform) tuples within the last hour
//      so a user can't farm XP by mashing the same button.
//
// The handler intentionally does NOT post to external networks itself — those
// platforms either don't expose a public "share for me" API (Instagram /
// TikTok) or do but require OAuth (X / WhatsApp Business). The frontend
// copies the link to the clipboard and opens the target site in a new tab.

import type { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { rawSqlite } from '../db.js';
import { addXP } from '../missions/engine.js';

type AuthedReq = Request & { user?: { uid: string } };

const VALID_SOURCE_MODULES = new Set([
  'mission',
  'reel',
  'post',
  'profile',
  'article',
]);

const VALID_PLATFORMS = new Set([
  'hellomara',  // internal Mara Feed re-post
  'you',        // user's own profile timeline
  'instagram',  // copy + open
  'tiktok',     // copy + open
  'x',          // intent URL
  'whatsapp',   // wa.me
  'telegram',   // t.me/share/url
  'link',       // copy to clipboard
]);

const SHARE_XP_REWARD = 25;
const DEDUP_WINDOW_SEC = 60 * 60; // 1 hour

// Resolve the canonical app origin so the share URLs work regardless of where
// the API is called from (admin tooling, server-rendered pages, etc.). The
// frontend can pass an explicit origin in the request body when it lives on a
// different host than the API, but in production both live behind the same
// proxy so APP_ORIGIN is the right default.
function appOrigin(req: Request, override?: string): string {
  if (override && /^https?:\/\//i.test(override)) return override.replace(/\/+$/, '');
  const env = process.env.APP_ORIGIN || process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/+$/, '');
  // Fall back to the request host so dev / preview deploys "just work".
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:5000';
  return `${proto}://${host}`;
}

function internalShareUrl(origin: string, sourceModule: string, sourceId: string): string {
  switch (sourceModule) {
    case 'mission':
      return `${origin}/missions?share=${encodeURIComponent(sourceId)}`;
    case 'reel':
      return `${origin}/reels?v=${encodeURIComponent(sourceId)}`;
    case 'post':
      return `${origin}/you?post=${encodeURIComponent(sourceId)}`;
    case 'profile':
      return `${origin}/you?u=${encodeURIComponent(sourceId)}`;
    case 'article':
      return `${origin}/writers-hub?a=${encodeURIComponent(sourceId)}`;
    default:
      return `${origin}/?share=${encodeURIComponent(sourceId)}`;
  }
}

function externalLink(platform: string, shareUrl: string, caption: string | null): string | null {
  const text = caption ? `${caption} ` : '';
  const enc = encodeURIComponent(`${text}${shareUrl}`);
  switch (platform) {
    case 'x':
      return `https://twitter.com/intent/tweet?text=${enc}`;
    case 'whatsapp':
      return `https://wa.me/?text=${enc}`;
    case 'telegram':
      return `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(caption ?? '')}`;
    case 'instagram':
      return 'https://www.instagram.com/';
    case 'tiktok':
      return 'https://www.tiktok.com/';
    case 'hellomara':
    case 'you':
    case 'link':
      return null; // handled internally / copy-only
    default:
      return null;
  }
}

export function registerShareRoutes(
  app: Express,
  requireAuth: (req: any, res: any, next: any) => void,
) {
  app.post('/api/share', requireAuth, async (req: AuthedReq, res: Response) => {
    const userId = req.user!.uid;
    const body = (req.body ?? {}) as {
      sourceModule?: unknown;
      sourceId?: unknown;
      sourceType?: unknown;
      targetModule?: unknown;
      targetPlatform?: unknown;
      caption?: unknown;
      origin?: unknown;
    };

    const sourceModule = typeof body.sourceModule === 'string' ? body.sourceModule : null;
    const sourceId = typeof body.sourceId === 'string' || typeof body.sourceId === 'number'
      ? String(body.sourceId)
      : null;
    const platform = typeof body.targetPlatform === 'string' ? body.targetPlatform : 'link';
    const caption = typeof body.caption === 'string' ? body.caption.slice(0, 500) : null;
    const sourceType = typeof body.sourceType === 'string' ? body.sourceType.slice(0, 60) : null;
    const targetModule = typeof body.targetModule === 'string' ? body.targetModule.slice(0, 60) : null;
    const originOverride = typeof body.origin === 'string' ? body.origin : undefined;

    if (!sourceModule || !VALID_SOURCE_MODULES.has(sourceModule)) {
      return res.status(400).json({ message: 'Invalid sourceModule.' });
    }
    if (!sourceId) {
      return res.status(400).json({ message: 'sourceId is required.' });
    }
    if (!VALID_PLATFORMS.has(platform)) {
      return res.status(400).json({ message: 'Invalid targetPlatform.' });
    }

    // Refuse duplicate (user, source, platform) within the dedup window. We
    // check unix seconds because that is what `created_at` is stored as.
    const recent = rawSqlite.prepare(`
      SELECT id FROM content_shares
       WHERE user_id = ?
         AND source_module = ?
         AND source_id = ?
         AND target_platform = ?
         AND created_at >= unixepoch() - ?
       LIMIT 1
    `).get(userId, sourceModule, sourceId, platform, DEDUP_WINDOW_SEC);
    if (recent) {
      return res.status(429).json({
        message: 'Already shared recently. Try again later.',
        recentlyShared: true,
      });
    }

    const origin = appOrigin(req, originOverride);
    const shareUrl = internalShareUrl(origin, sourceModule, sourceId);
    const link = externalLink(platform, shareUrl, caption);

    const id = randomUUID();
    rawSqlite.prepare(`
      INSERT INTO content_shares
        (id, user_id, source_module, source_id, source_type,
         target_module, target_platform, caption, share_url, xp_awarded, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `).run(
      id,
      userId,
      sourceModule,
      sourceId,
      sourceType,
      targetModule,
      platform,
      caption,
      shareUrl,
      SHARE_XP_REWARD,
    );

    let xpResult: { xp: number; level: number; leveledUp: boolean; gained: number } | null = null;
    try {
      xpResult = addXP(userId, SHARE_XP_REWARD);
    } catch (err) {
      // Don't fail the share if the XP table is unreachable — log and return
      // the URL anyway so the user still gets the link in their clipboard.
      console.error('[share] addXP failed:', err);
    }

    return res.json({
      ok: true,
      id,
      shareUrl,
      externalLink: link,
      xpAwarded: xpResult ? xpResult.gained : 0,
      xp: xpResult?.xp ?? null,
      level: xpResult?.level ?? null,
      leveledUp: xpResult?.leveledUp ?? false,
    });
  });

  // Lightweight list endpoint so the You profile can show "Recent shares" if
  // we want to expose the history later. Returns only the caller's own rows.
  app.get('/api/share/mine', requireAuth, (req: AuthedReq, res: Response) => {
    const userId = req.user!.uid;
    const rows = rawSqlite.prepare(`
      SELECT id, source_module AS sourceModule, source_id AS sourceId,
             target_platform AS targetPlatform, caption, share_url AS shareUrl,
             xp_awarded AS xpAwarded, created_at AS createdAt
        FROM content_shares
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50
    `).all(userId);
    res.json({ shares: rows });
  });
}
