import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logError } from './logger.js';
import { initSentry, captureException } from './lib/observability.js';
import type { Request, Response, NextFunction } from 'express';
import { registerRoutes } from './routes.js';
import { serveStatic } from './static.js';
import { createServer } from 'http';
import { brainManager } from './mara-brain/index.js';
import { getMaraResponse } from './ai.js';
import { setupSessionAuth, csrfProtection } from './auth.js';
import { globalApiRateLimit } from './rate-limit.js';
import { rawSqlite } from './db.js';
import { UPLOADS_DIR } from './modules/reels.js';
import { IMAGE_UPLOADS_DIR } from './modules/uploads.js';
import { registerHoneypotRoutes } from './security/honeypot.js';
import { blacklistMiddleware } from './security/blacklist-middleware.js';
import { startBackgroundJobs } from './bootstrap/jobs.js';
import { runMigrations } from './bootstrap/migrations.js';
import { attachProcessSafetyHandlers } from './bootstrap/process-safety.js';
import { attachRequestLogging } from './bootstrap/request-logging.js';
import { runBootstrapSeeders } from './bootstrap/seed.js';
import { attachWebSocketServer } from './websocket/index.js';
dotenv.config();

attachProcessSafetyHandlers();

const app = express();

// Helmet sets secure HTTP response headers. contentSecurityPolicy is disabled
// in development because Vite's HMR injects inline scripts that would be blocked
// by a strict CSP. In production, Helmet's own defaults apply except for
// connect-src: the Nexus Core voice feature fetches audio directly from the
// owner's laptop — both speech-to-text (stt.hellomara.net) and, since this
// replaced the robotic browser window.speechSynthesis voice, text-to-speech
// (tts.hellomara.net, server/stt/tts_server.py, edge-tts neural voices) —
// each reachable only via Cloudflare Tunnel + its own bearer token, from the
// browser/Electron renderer, which default-src 'self' would otherwise block.
// media-src explicitly allows blob: so the spoken-reply <audio> element
// (built from a Blob returned by the tts.hellomara.net fetch above) can
// actually play — without it, media-src falls back to default-src 'self',
// which most browsers treat as covering same-origin-created blob: URLs, but
// this is made explicit rather than relying on that fallback nuance.
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // fonts.googleapis.com is allowed by default under style-src (which
        // is why the initial stylesheet <link> loads fine), but the service
        // worker's own StaleWhileRevalidate fetch() of that same URL (to
        // cache it) is a fetch call, governed by connect-src, not style-src
        // — confirmed live (DevTools): that fetch was silently CSP-blocked,
        // spamming console errors and leaving the font never cached for
        // offline use. gstatic.com is where the actual font FILES the
        // stylesheet references are hosted.
        // tiktok.com added defensively for Sparks Phase 4: their embed.js may
        // fetch its own oEmbed data from the top-level page before swapping
        // in the iframe (unconfirmed — TikTok doesn't document embed.js
        // internals). Cheap to allow, and the failure mode without it is a
        // silent CSP block identical to the SW-reset-script incident, so this
        // errs toward allowing rather than debugging that again blind.
        'connect-src': ["'self'", 'https://stt.hellomara.net', 'https://tts.hellomara.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://www.tiktok.com'],
        // Several seeded demo Sparks point at well-known public sample-video
        // hosts (Google's GTV sample bucket, test-videos.co.uk) rather than
        // an uploaded file — media-src 'self' blob: silently blocked all of
        // them (confirmed live via DevTools CSP violations), showing as a
        // blank player with no error at all since the browser just refuses
        // to load the <video> src.
        'media-src': ["'self'", 'blob:', 'https://commondatastorage.googleapis.com', 'https://test-videos.co.uk'],
        // Helmet's default img-src is 'self' data: — silently blocks any
        // externally-hosted image. Confirmed live (DevTools CSP violations):
        // this broke Public Library book covers (gutenberg.org) and, likely
        // longer-standing, Reels' YouTube thumbnails (img.youtube.com).
        'img-src': ["'self'", 'data:', 'https://www.gutenberg.org', 'https://img.youtube.com'],
        // The one-time service-worker reset script (frontend/index.html) is
        // a deliberate inline <script> — CSP's default script-src 'self'
        // blocks ALL inline scripts with no exception, which meant this fix
        // itself silently never ran for anyone since the day it shipped
        // (confirmed live: Chrome reported the exact violation + the hash
        // needed). Allow it by content hash rather than 'unsafe-inline' (that
        // would defeat the point of having a script-src allowlist at all).
        // MAINTENANCE: if that inline script's text ever changes, this hash
        // must be recomputed (sha256 of the LF-normalized script body —
        // browsers normalize CRLF -> LF before hashing) or the new version
        // will be silently blocked exactly like this one was.
        // Sparks Phase 4 (external-link Sparks) adds tiktok.com here: TikTok's
        // own oEmbed contract is a <blockquote> + their embed.js script, which
        // TikTok then swaps for an iframe itself — so we need to allow their
        // script to load at all (script-src) and allow the iframe it creates
        // (frame-src, below). YouTube needs neither: it's rendered as a plain
        // <iframe src="https://www.youtube.com/embed/...">  we build ourselves.
        'script-src': ["'self'", "'sha256-T0x20b4Axbsd8miTEV/35zopEK29KmzKKycfi9DY5Wk='", 'https://www.tiktok.com'],
        // frame-src has no Helmet default (CSP falls back to default-src
        // 'self', which would silently block both embeds without this).
        'frame-src': ["'self'", 'https://www.youtube.com', 'https://www.tiktok.com'],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
  }),
);

type RuntimeState = {
  requestedPort: number | null;
  boundPort: number | null;
  host: string;
  startedAt: string | null;
};

const runtimeState: RuntimeState = {
  requestedPort: null,
  boundPort: null,
  host: process.env.HOST || '0.0.0.0',
  startedAt: null,
};

// --- START RATE LIMITER LOGIC (moved to server/rateLimit.ts) ---
// Re-imported for use in the WebSocket chat handler below.
// --- END RATE LIMITER LOGIC ---

// --- CORS configuration ---
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') {
        return callback(null, true); // Allow all in dev if no origins configured
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Deny by omitting CORS headers, but never throw — a thrown error here
      // becomes an uncaught middleware error and Express returns 500 for
      // *every* request (including same-origin asset loads from index.html),
      // which turns the app into a black page on any misconfigured origin.
      return callback(null, false);
    },
    credentials: true,
  }),
);

setupSessionAuth(app);

// Honeypot traps must be registered BEFORE main routes so they intercept
// scanner traffic before any legitimate handler sees it.
registerHoneypotRoutes(app);

// Blacklist check runs early — after IP resolution (trust proxy set in
// setupSessionAuth) but before any application logic.
app.use(blacklistMiddleware);

const httpServer = createServer(app);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Global flood-protection on all /api/* routes (300 req / IP / 15 min).
// Per-route limiters (auth, TTS, uploads, etc.) apply stricter limits on top.
// /api/health and /api/runtime are excluded so uptime probes are never throttled.
app.use(/^\/api\/(?!health|runtime)/, globalApiRateLimit);

// Lightweight health probe for local/dev orchestration and uptime checks.
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// SQLite integrity check — returns {"db":"ok"} or {"db":"corrupt","detail":"..."}.
app.get('/api/health/db', (_req, res) => {
  try {
    const rows = rawSqlite.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const result = rows[0]?.integrity_check ?? 'unknown';
    if (result === 'ok') {
      res.json({ db: 'ok' });
    } else {
      res.status(500).json({ db: 'corrupt', detail: result });
    }
  } catch (err) {
    res.status(500).json({ db: 'corrupt', detail: err instanceof Error ? err.message : String(err) });
  }
});

// /api/auth/me returns the full user payload (registered in routes.ts via
// auth-api.meHandler). We keep a lightweight `/api/auth/csrf` endpoint here
// so the SPA can grab a CSRF token for unauthenticated mutating calls
// (signup, password reset) without going through the heavier user-lookup
// path.
app.get('/api/auth/csrf', (req: any, res) => {
  res.json({ uid: req.user?.uid ?? null, csrfToken: req.session?.csrfToken ?? null });
});

app.get('/api/runtime', (_req, res) => {
  const displayHost =
    runtimeState.host === '0.0.0.0' ? 'localhost' : runtimeState.host;
  const effectivePort = runtimeState.boundPort ?? runtimeState.requestedPort;
  const apiBaseUrl = effectivePort
    ? `http://${displayHost}:${effectivePort}`
    : null;

  res.status(200).json({
    ...runtimeState,
    apiBaseUrl,
  });
});

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

attachRequestLogging(app, log);

(async () => {
  // Initialise error tracking as early as possible so failures during
  // migrations/seed are still reported. No-op unless SENTRY_DSN is set.
  initSentry();
  runMigrations();

  await runBootstrapSeeders();
  startBackgroundJobs();
  // Serve uploaded reel files from the configured volume. Mounted BEFORE
  // registerRoutes so it wins over any `/videos` proxy or catch-all later.
  // `maxAge` allows aggressive browser caching — the filename is content-
  // hashed so invalidation is not a concern.
  //
  // Defense-in-depth: set `X-Content-Type-Options: nosniff` so a browser
  // never second-guesses the Content-Type. Extensions are already derived
  // from the server-validated MIME whitelist (see backend/src/modules/reels.ts),
  // but we treat the static tree as untrusted user content anyway.
  app.use(
    '/videos/files',
    (_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
    express.static(UPLOADS_DIR, {
      maxAge: '7d',
      immutable: true,
      fallthrough: false,
    }),
  );

  // Same shape, different volume: user-uploaded images (avatar, cover,
  // post image, writers cover). Filenames are content-hashed so we can
  // cache aggressively, and `nosniff` keeps the static tree honest in
  // case a future MIME slips through the upload whitelist.
  app.use(
    '/uploads/images',
    (_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
    express.static(IMAGE_UPLOADS_DIR, {
      maxAge: '7d',
      immutable: true,
      fallthrough: false,
    }),
  );

  await registerRoutes(httpServer, app);

  attachWebSocketServer({ httpServer, allowedOrigins, log });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    const errorLog = {
      path: req.path,
      method: req.method,
      status,
      message,
      stack: err.stack,
      query: req.query,
    };
    logError(err, errorLog);
    captureException(err, errorLog);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === 'production') {
    serveStatic(app);
  } else {
    const { setupVite } = await import('./vite.js');
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const requestedPort = parseInt(process.env.PORT || '5000', 10);
  runtimeState.requestedPort = requestedPort;

  function onServerReady(boundPort: number) {
    runtimeState.boundPort = boundPort;
    runtimeState.startedAt = new Date().toISOString();
    log(`serving on port ${boundPort}`);
    const displayHost =
      runtimeState.host === '0.0.0.0' ? 'localhost' : runtimeState.host;
    log(
      `Runtime URL: http://${displayHost}:${boundPort} (health: /api/health, runtime: /api/runtime)`,
      'runtime',
    );

    // Mara Brain scheduler — enabled by default (PR C). To kill:
    //   BRAIN_ENABLED=false or PROCESS_AI_TASKS=false.
    // See server/mara-brain/manager.ts for full lifecycle + status.
    brainManager.start(log);
  }

  // Logica simplificată pentru pornirea serverului, ideală pentru Cloud Run
  httpServer.listen(requestedPort, runtimeState.host, () => {
    onServerReady(requestedPort);
  });
})().catch((err) => {
  // Bootstrap (migrations, seed, passport setup, etc.) failed before the
  // server ever started listening. Without this .catch() the rejection
  // would be swallowed by the `unhandledRejection` handler above and the
  // process would live on as a zombie — alive enough for liveness probes
  // to pass, but never bound to a port so no traffic is ever served.
  console.error('[startup] fatal:', err);
  captureException(err, { phase: 'bootstrap' });
  process.exit(1);
});
