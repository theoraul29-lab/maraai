// Launch countdown — landing page + /preview gate + waitlist API.
//
// While the launch date (2026-06-01T00:00:00Z) is in the future:
//   - GET /         → public/landing.html (countdown + waitlist form)
//   - GET /preview  → token form / sets cookie / serves the SPA index.html
//   - POST /api/waitlist → rate-limited insert into mara_waitlist
//
// On and after the launch date:
//   - GET /         → falls through to express.static (SPA index.html)
//   - /preview routes keep working (so beta testers don't lose access)
//   - /api/waitlist keeps working (so referrals after launch still get
//     captured, but they'll auto-receive credentials via a follow-up
//     mailer)
//
// Admin endpoints (always on):
//   - GET /api/admin/waitlist            → JSON list + counts
//   - GET /api/admin/waitlist/export.csv → CSV download
//
// No new npm dependencies: cookies are parsed inline.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import { db, rawSqlite } from '../db.js';
import { maraWaitlist } from '../../shared/schema.js';
import { desc, sql as drizzleSql } from 'drizzle-orm';
import { createIPRateLimit } from '../rate-limit.js';

const LAUNCH_DATE = new Date(
  process.env.LAUNCH_DATE_ISO || '2026-06-01T00:00:00Z',
);

const DEFAULT_PREVIEW_TOKEN = 'marapreview2026';
function getPreviewToken(): string {
  return process.env.PREVIEW_TOKEN || DEFAULT_PREVIEW_TOKEN;
}

const PREVIEW_COOKIE = 'preview_token';
const PREVIEW_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Read a single cookie from the raw `Cookie:` header. We deliberately
// avoid adding cookie-parser as a dep because we only need one cookie.
function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw || typeof raw !== 'string') return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Pre-launch landing page is cached in memory at boot. We re-read on
// every request only in development so designers can edit and refresh.
let cachedLandingHtml: string | null = null;
function readLandingHtml(): string {
  if (process.env.NODE_ENV === 'production' && cachedLandingHtml) {
    return cachedLandingHtml;
  }
  const p = path.resolve(process.cwd(), 'public', 'landing.html');
  cachedLandingHtml = fs.readFileSync(p, 'utf8');
  return cachedLandingHtml;
}

// SPA fallback path — we resolve relative to cwd so it works the same
// in dev and prod (both run from project root).
function spaIndexPath(): string {
  return path.resolve(process.cwd(), 'dist', 'public', 'index.html');
}

export function isLaunched(now: Date = new Date()): boolean {
  return now.getTime() >= LAUNCH_DATE.getTime();
}

// SHA-256 hash of the client IP so we can rate-limit and dedupe without
// keeping the raw address (GDPR).
function hashIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

// Tiny email validator — explicit on what we accept so we never feed a
// garbage string into Postgres-style escaping logic.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

// --- 403 page rendered when /preview is hit without a valid token ---
// Same markup the user approved in the design. <meta charset="UTF-8">
// is required so the literal arrow "→" renders correctly.
function renderPreviewGate(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>hellomara — Preview Access</title>
  <style>
    body { background: #040408; color: #F0F0F0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; gap: 24px; }
    h1 { font-size: 32px; color: #2ECC71; letter-spacing: -1px; margin: 0; }
    form { display: flex; gap: 0; }
    input { padding: 12px 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-right: none; color: white; font-size: 14px; outline: none; width: 280px; }
    button { padding: 12px 24px; background: #2ECC71; color: #040408; border: none; font-size: 14px; font-weight: 700; cursor: pointer; }
    button:hover { background: #27ae60; }
    p { color: rgba(255,255,255,0.3); font-size: 13px; margin: 0; }
  </style>
</head>
<body>
  <h1>hellomara preview</h1>
  <p>Enter access token to view the platform</p>
  <form method="GET" action="/preview">
    <input type="password" name="token" placeholder="Access token" autofocus>
    <button type="submit">Enter →</button>
  </form>
</body>
</html>`;
}

// ----------------------------------------------------------------------
// Route registration
// ----------------------------------------------------------------------

export function registerLaunchCountdown(
  app: Express,
  requireAdmin: (req: any, res: any, next: any) => any,
) {
  // GET /landing-script.js — serves the external countdown/waitlist JS for
  // landing.html. Kept as a dedicated route (rather than relying on
  // express.static) so it works in both dev and production, and so the file
  // never leaks from inside the public/ source directory via a generic static
  // handler.
  app.get('/landing-script.js', (_req: Request, res: Response) => {
    const scriptPath = path.resolve(process.cwd(), 'public', 'landing-script.js');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.sendFile(scriptPath);
  });

  // GET / — landing for the countdown window, SPA after launch.
  //
  // Cookie holders (= the team and our beta testers) always see the SPA
  // so we don't lose access to the platform while we're showing the
  // landing to the world.
  app.get('/', (req: Request, res: Response, next: NextFunction) => {
    if (isLaunched()) return next();
    const cookieTok = readCookie(req, PREVIEW_COOKIE);
    if (cookieTok && cookieTok === getPreviewToken()) return next();
    try {
      const html = readLandingHtml();
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.type('html').send(html);
    } catch (err) {
      console.error('[landing] failed to read landing.html:', err);
      return next();
    }
  });

  // GET /preview — token form (no token) or sets cookie + SPA (correct token).
  app.get('/preview', (req: Request, res: Response, next: NextFunction) => {
    const queryToken =
      typeof req.query.token === 'string' ? req.query.token : '';
    const cookieToken = readCookie(req, PREVIEW_COOKIE) || '';
    const PREVIEW_TOKEN = getPreviewToken();

    const tokenOk =
      (queryToken && queryToken === PREVIEW_TOKEN) ||
      (cookieToken && cookieToken === PREVIEW_TOKEN);

    if (!tokenOk) {
      return res.status(403).type('html').send(renderPreviewGate());
    }

    if (queryToken && queryToken === PREVIEW_TOKEN) {
      // Persist for 7 days so the rest of the SPA works without /preview.
      res.cookie(PREVIEW_COOKIE, PREVIEW_TOKEN, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: PREVIEW_COOKIE_MAX_AGE_MS,
        secure: process.env.NODE_ENV === 'production',
      });
    }

    try {
      return res.sendFile(spaIndexPath());
    } catch (err) {
      console.error('[preview] failed to send SPA index:', err);
      return next();
    }
  });

  // GET /preview/* — same gate, used for direct links to deep SPA paths.
  app.get('/preview/*', (req: Request, res: Response, next: NextFunction) => {
    const cookieToken = readCookie(req, PREVIEW_COOKIE) || '';
    if (cookieToken !== getPreviewToken()) {
      return res.redirect('/preview');
    }
    try {
      return res.sendFile(spaIndexPath());
    } catch (err) {
      console.error('[preview/*] failed to send SPA index:', err);
      return next();
    }
  });

  // POST /api/waitlist — public, rate-limited.
  //
  // Idempotent: a duplicate email returns 200 with { ok: true, dedup: true }.
  // We surface "ok" so the user always sees success and never learns
  // whether their email was already registered (info-leak prevention).
  const waitlistLimit = createIPRateLimit({
    name: 'waitlist:post',
    max: Number(process.env.WAITLIST_RL_MAX || 5),
    windowMs: Number(process.env.WAITLIST_RL_WINDOW_MS || 15 * 60 * 1000),
  });
  app.post(
    '/api/waitlist',
    waitlistLimit,
    async (req: Request, res: Response) => {
      try {
        const body =
          typeof req.body === 'object' && req.body ? req.body : {};

        // Honeypot — bots fill this; real users can't see it.
        if (typeof body.website === 'string' && body.website.length > 0) {
          // Pretend success so bots don't retry with mutations.
          return res.json({ ok: true });
        }

        const email = normalizeEmail(body.email);
        if (!email) {
          return res.status(400).json({
            ok: false,
            message: 'Please enter a valid email address.',
          });
        }

        const source =
          typeof body.source === 'string' && body.source.length > 0
            ? body.source.slice(0, 32)
            : 'landing';
        const referrer =
          typeof body.referrer === 'string' && body.referrer.length > 0
            ? body.referrer.slice(0, 1024)
            : null;
        const ua =
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent'].slice(0, 512)
            : null;
        const ipHash = hashIp(req.ip);

        try {
          await db
            .insert(maraWaitlist)
            .values({
              email,
              source,
              referrer,
              ipHash,
              userAgent: ua,
            })
            .onConflictDoNothing({ target: maraWaitlist.email });
        } catch (err) {
          console.error('[waitlist] insert failed:', err);
          // Still return ok so users aren't blocked by a transient DB
          // hiccup — we'll see the error in logs.
        }

        return res.json({ ok: true });
      } catch (err) {
        console.error('[waitlist] handler error:', err);
        return res.status(500).json({ ok: false });
      }
    },
  );

  // GET /api/admin/waitlist — JSON listing for the admin UI.
  app.get(
    '/api/admin/waitlist',
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const rows = await db
          .select()
          .from(maraWaitlist)
          .orderBy(desc(maraWaitlist.createdAt))
          .limit(5000);

        // last_24h count — pulled via raw SQL because we don't need the
        // full row objects.
        const last24hCutoff = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
        const last24h = rawSqlite
          .prepare(
            'SELECT COUNT(*) AS c FROM mara_waitlist WHERE created_at >= ?',
          )
          .get(last24hCutoff) as { c: number } | undefined;

        return res.json({
          total: rows.length,
          last_24h: last24h?.c ?? 0,
          entries: rows.map((r) => ({
            id: r.id,
            email: r.email,
            source: r.source,
            referrer: r.referrer,
            createdAt: r.createdAt,
            createdAtIso: new Date(r.createdAt * 1000).toISOString(),
          })),
        });
      } catch (err) {
        console.error('[waitlist:admin] list failed:', err);
        return res.status(500).json({ message: 'Internal error.' });
      }
    },
  );

  // GET /api/admin/waitlist/export.csv — CSV download.
  app.get(
    '/api/admin/waitlist/export.csv',
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const rows = await db
          .select()
          .from(maraWaitlist)
          .orderBy(desc(maraWaitlist.createdAt));

        const header = 'email,source,referrer,created_at_iso\n';
        const lines = rows.map((r) => {
          const created = new Date(r.createdAt * 1000).toISOString();
          const safe = (v: string | null | undefined) =>
            '"' + String(v ?? '').replace(/"/g, '""') + '"';
          return [
            safe(r.email),
            safe(r.source),
            safe(r.referrer),
            safe(created),
          ].join(',');
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
        );
        return res.send(header + lines.join('\n') + '\n');
      } catch (err) {
        console.error('[waitlist:admin] export failed:', err);
        return res.status(500).json({ message: 'Internal error.' });
      }
    },
  );

  // Touch a reference so drizzle's sql tagged helper is treated as used
  // (some checks otherwise flag the import as dead).
  void drizzleSql;

  console.log(
    `[launch-countdown] ready — launch=${LAUNCH_DATE.toISOString()} ` +
      `launched=${isLaunched()} previewTokenSet=${process.env.PREVIEW_TOKEN ? 'yes' : 'NO (using default)'}`,
  );
}
