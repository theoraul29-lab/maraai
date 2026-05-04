import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logError } from './logger.js';
import type { Request, Response, NextFunction } from 'express';
import { registerRoutes } from './routes.js';
import { serveStatic } from './static.js';
import { createServer } from 'http';
import { brainManager } from './mara-brain/index.js';
import { getMaraResponse } from './ai.js';
import { WebSocketServer } from 'ws';
import { storage } from './storage.js';
import { setupSessionAuth, csrfProtection } from './auth.js';
import { checkRateLimit } from './rateLimit.js';
import { z } from 'zod';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, rawSqlite } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { UPLOADS_DIR } from '../backend/src/modules/reels.js';
import { IMAGE_UPLOADS_DIR } from '../backend/src/modules/uploads.js';
import { seedPlans } from './billing/seed.js';
import { seedTradingAcademy } from './trading/seed.js';
dotenv.config();

// Process-level safety net for *runtime* bugs in request handlers.
//
// Rationale (runtime): since Node v15 an unhandled promise rejection kills
// the process. In a multi-tenant server that takes down every connected
// user for a bug that affected only one request. For `unhandledRejection`
// we log and keep running — individual request handlers are already wrapped
// in try/catch + the express error middleware returns a proper 500.
//
// Rationale (uncaughtException): Node docs explicitly warn that it is
// unsafe to resume after an uncaught synchronous exception — the call
// stack unwound through code that assumed it wouldn't throw, so in-memory
// state (DB transactions, sockets, auth) may be corrupted. We log and
// exit(1) so the orchestrator (Railway, Docker, etc.) restarts us clean.
//
// NOTE: these handlers are installed AFTER the startup IIFE below attaches
// its own .catch() — so rejections from bootstrap code (migrations, seed)
// still terminate the process with a clear log line, rather than becoming
// a zombie (alive but never listening).
process.on('unhandledRejection', (reason, promise) => {
  console.error('[process] unhandledRejection:', reason);
  // `promise` is the rejected Promise itself; logging it usually adds no
  // new information beyond the reason, but we keep a reference so Node
  // doesn't garbage-collect it mid-inspection in a debugger.
  void promise;
});

process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
  // Node docs: "It is not safe to resume normal operation after
  // 'uncaughtException'." Exit so the orchestrator restarts us in a
  // clean state rather than serving requests on a corrupted runtime.
  process.exit(1);
});

const __migrationFilename = fileURLToPath(import.meta.url);
const __migrationDirname = path.dirname(__migrationFilename);

function runMigrations() {
  const migrationsFolder = path.resolve(__migrationDirname, '..', 'migrations');
  try {
    migrate(db, { migrationsFolder });
    console.log('[migrations] Drizzle migrations applied successfully');
  } catch (err) {
    console.error('[migrations] Failed to run migrations:', err);
    throw err;
  }

  // Safety guard: ensure the users table has every column declared by the
  // current schema. Migration 0007_you_fb_profile added cover_image_url,
  // location and website, but production databases that were created from
  // a snapshot taken before that migration ran (or where 0007 was recorded
  // as applied without the DDL actually executing) are missing them,
  // causing:
  //   SqliteError: no such column: "cover_image_url"
  //
  // Drizzle's `db.select().from(users)` expands to an explicit column list
  // from the in-memory schema, so any missing column makes /api/auth/me +
  // /api/auth/signup throw — and Express 4 silently swallows the rejection
  // in async handlers, hanging the request past the upstream proxy
  // deadline. See server/modules/auth-api.ts wrapAsync() for the
  // last-resort net.
  //
  // SQLite has no ALTER TABLE … ADD COLUMN IF NOT EXISTS, so we PRAGMA
  // table_info first and only issue the ALTER TABLE when the column is
  // absent. Each column is wrapped in its own try/catch so a transient
  // failure on one (e.g. duplicate-column race with another boot) does
  // not skip the rest.
  try {
    type ColumnInfo = { name: string };
    const columns = rawSqlite.pragma('table_info(users)') as ColumnInfo[];
    const have = new Set(columns.map((c) => c.name));
    const required: Array<[string, string]> = [
      ['cover_image_url', 'text'],
      ['location', 'text'],
      ['website', 'text'],
    ];
    for (const [name, type] of required) {
      if (have.has(name)) continue;
      try {
        rawSqlite.exec(`ALTER TABLE \`users\` ADD COLUMN \`${name}\` ${type};`);
        console.log(`[migrations] Added missing users.${name} column`);
      } catch (colErr) {
        console.error(
          `[migrations] Failed to add users.${name} column (non-fatal):`,
          colErr,
        );
      }
    }
  } catch (err) {
    console.error('[migrations] Failed to inspect users table for safety guard:', err);
    throw err;
  }

  // Safety guard: ensure FB-style profile tables exist. Migrations 0007 and
  // 0014 create user_posts / post_likes / post_comments, but production
  // databases that were initialised from a snapshot taken before those
  // migrations ran (or where the row was inserted into __drizzle_migrations
  // without the DDL actually executing) are missing the tables, causing
  // every /api/profile/:id, /api/profile/me, /api/profile/:id/posts,
  // POST /api/profile/posts, /like, /comment call to throw with no useful
  // error to the client. Same shape as the cover_image_url guard above —
  // CREATE TABLE IF NOT EXISTS is idempotent so this is safe to run on
  // every boot.
  type TableInfo = { name: string };
  const tableExists = (name: string): boolean => {
    try {
      const rows = rawSqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .all(name) as TableInfo[];
      return rows.length > 0;
    } catch {
      return false;
    }
  };

  const ensureTable = (name: string, ddl: string, indexDdl: readonly string[] = []) => {
    if (tableExists(name)) return;
    try {
      rawSqlite.exec(ddl);
      for (const idx of indexDdl) {
        try {
          rawSqlite.exec(idx);
        } catch (e) {
          console.error(`[migrations] Failed to create index on ${name} (non-fatal):`, e);
        }
      }
      console.log(`[migrations] Created missing ${name} table`);
    } catch (e) {
      console.error(`[migrations] Failed to create ${name} table (non-fatal):`, e);
    }
  };

  ensureTable(
    'user_posts',
    `CREATE TABLE IF NOT EXISTS \`user_posts\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`user_id\` text NOT NULL,
      \`content\` text NOT NULL,
      \`image_url\` text,
      \`created_at\` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );`,
    [
      'CREATE INDEX IF NOT EXISTS `IDX_user_posts_user` ON `user_posts` (`user_id`);',
      'CREATE INDEX IF NOT EXISTS `IDX_user_posts_created` ON `user_posts` (`created_at`);',
    ],
  );

  ensureTable(
    'post_likes',
    `CREATE TABLE IF NOT EXISTS \`post_likes\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`post_id\` integer NOT NULL,
      \`user_id\` text NOT NULL,
      \`created_at\` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );`,
    [
      'CREATE UNIQUE INDEX IF NOT EXISTS `IDX_post_likes_unique` ON `post_likes` (`post_id`, `user_id`);',
    ],
  );

  ensureTable(
    'post_comments',
    `CREATE TABLE IF NOT EXISTS \`post_comments\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`post_id\` integer NOT NULL,
      \`user_id\` text NOT NULL,
      \`content\` text NOT NULL,
      \`created_at\` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );`,
    [
      'CREATE INDEX IF NOT EXISTS `IDX_post_comments_post` ON `post_comments` (`post_id`);',
    ],
  );
}


const app = express();

// Helmet sets secure HTTP response headers. contentSecurityPolicy is disabled
// in development because Vite's HMR injects inline scripts that would be blocked
// by a strict CSP. In production the default helmet CSP is applied.
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
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

// Lightweight health probe for local/dev orchestration and uptime checks.
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
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

const SENSITIVE_LOG_FIELDS = new Set([
  'password', 'passwordHash', 'password_hash',
  'resetToken', 'reset_token', 'token',
  'passwordConfirm', 'newPassword',
]);

function sanitizeForLog(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_LOG_FIELDS.has(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeForLog(v as Record<string, any>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

app.use((req, res, next) => {
  const start = Date.now();
  const { path } = req;
  let capturedJsonResponse: Record<string, any> | undefined;

  if (process.env.NODE_ENV !== 'production') {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(sanitizeForLog(capturedJsonResponse))}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  runMigrations();

  // Upsert the canonical plan catalogue (Free / Pro / VIP / Creator ×
  // monthly+yearly) so `GET /api/billing/plans` always has fresh rows and
  // operators can tweak pricing without writing a new migration.
  try {
    await seedPlans();
    console.log('[billing] plans seeded');
  } catch (err) {
    console.error('[billing] seed failed:', err);
    throw err;
  }

  // Trading Academy catalogue (PR F). Additive — missing rows are
  // inserted, existing rows are updated with the current content above.
  try {
    await seedTradingAcademy();
    console.log('[trading] academy catalogue seeded');
  } catch (err) {
    // Do NOT throw: if the content seed fails, the API is still usable
    // (just with an empty catalogue). We'd rather boot than crash-loop.
    console.error('[trading] seed failed (continuing):', err);
  }

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

  // --- START P2P WEBSOCKET INTEGRATION ---
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, done) => {
      const origin = info.origin || info.req.headers.origin;
      if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
        return done(true); // Allow all in dev if no origins configured
      }
      if (!origin || allowedOrigins.includes(origin)) {
        return done(true);
      }
      log(`WebSocket connection rejected from origin: ${origin}`, 'p2p-ws');
      return done(false, 403, 'Origin not allowed');
    },
  });
  const userConnections = new Map<string, any>();
  // In-memory index of which connected peers are currently caching which
  // video IDs (Reels P2P distribution). This lives only in process memory —
  // on restart peers re-announce via `p2p-have-video`.
  //
  // videoSeeders: videoId -> Set<userId>
  // peerSeeds:    userId  -> Set<videoId>  (so we can clean up on disconnect)
  const videoSeeders = new Map<number, Set<string>>();
  const peerSeeds = new Map<string, Set<number>>();

  // Per-connection cap on how many videos a single peer can claim to be
  // seeding. Without this a malicious client can flood `p2p-have-video`
  // with unique IDs and grow the maps without bound until the server OOMs.
  const MAX_SEEDS_PER_USER = Number.parseInt(
    process.env.P2P_MAX_SEEDS_PER_USER ?? '',
    10,
  ) || 500;

  const addSeed = (userId: string, videoId: number) => {
    let owned = peerSeeds.get(userId);
    if (owned && owned.size >= MAX_SEEDS_PER_USER && !owned.has(videoId)) {
      // Silently reject — client can drop something before adding more.
      return;
    }
    let seeders = videoSeeders.get(videoId);
    if (!seeders) {
      seeders = new Set<string>();
      videoSeeders.set(videoId, seeders);
    }
    seeders.add(userId);
    if (!owned) {
      owned = new Set<number>();
      peerSeeds.set(userId, owned);
    }
    owned.add(videoId);
  };
  const removeSeed = (userId: string, videoId: number) => {
    const seeders = videoSeeders.get(videoId);
    if (seeders) {
      seeders.delete(userId);
      if (seeders.size === 0) videoSeeders.delete(videoId);
    }
    const owned = peerSeeds.get(userId);
    if (owned) {
      owned.delete(videoId);
      if (owned.size === 0) peerSeeds.delete(userId);
    }
  };
  const clearSeedsForUser = (userId: string) => {
    const owned = peerSeeds.get(userId);
    if (!owned) return;
    for (const videoId of owned) {
      const seeders = videoSeeders.get(videoId);
      if (seeders) {
        seeders.delete(userId);
        if (seeders.size === 0) videoSeeders.delete(videoId);
      }
    }
    peerSeeds.delete(userId);
  };

  wss.on('connection', (ws: any, req: any) => {
    // Use the session-authenticated user id exclusively. Ignoring any
    // client-supplied ?userId= query param prevents trivial identity spoofing.
    const finalUserId = req.user?.uid;
    if (finalUserId) {
      log(`P2P user connected: ${finalUserId}`, 'p2p-ws');
      userConnections.set(finalUserId, ws);
      ws.userId = finalUserId;
    } else {
      log('Anonymous P2P user connected.', 'p2p-ws');
    }

    ws.on('message', (message: Buffer) => {
      let data;
      try {
        data = JSON.parse(message.toString());
      } catch (e) {
        logError(e, { message: 'Invalid P2P JSON message' });
        return;
      }

      // --- START WEBSOCKET MESSAGE ROUTER ---
      const targetSocket = userConnections.get(data.target);
      switch (data.type) {
        // --- P2P Signaling Handler ---
        case 'p2p-offer':
        case 'p2p-answer':
        case 'p2p-candidate':
          log(
            `Redirecting P2P message ${data.type} from ${ws.userId} to ${data.target}`,
            'p2p-ws',
          );
          if (targetSocket) {
            // Add the sender's ID so the recipient knows who the offer is from
            data.from = ws.userId;
            targetSocket.send(JSON.stringify(data));
          } else {
            log(
              `P2P target user not found or not connected: ${data.target}`,
              'p2p-ws',
            );
          }
          break;

        // --- Reel P2P seed advertising (PR D) ---
        //
        // Peers announce which video IDs they currently have cached
        // locally so that other peers can fetch bytes P2P via WebRTC
        // instead of hammering the origin / CDN. The server keeps the
        // index in-memory only; peers re-advertise on reconnect.
        case 'p2p-have-video': {
          if (!ws.userId) break;
          const vid = Number((data as any).videoId);
          if (!Number.isFinite(vid)) break;
          addSeed(ws.userId, vid);
          break;
        }
        case 'p2p-drop-video': {
          if (!ws.userId) break;
          const vid = Number((data as any).videoId);
          if (!Number.isFinite(vid)) break;
          removeSeed(ws.userId, vid);
          break;
        }
        case 'p2p-want-video': {
          const vid = Number((data as any).videoId);
          if (!Number.isFinite(vid)) break;
          const seeders = videoSeeders.get(vid);
          const peers = seeders
            ? Array.from(seeders).filter((uid) => uid !== ws.userId).slice(0, 8)
            : [];
          ws.send(
            JSON.stringify({
              type: 'p2p-peer-list',
              videoId: vid,
              peers,
            }),
          );
          break;
        }

        // --- AI Chat Handler ---
        case 'chat':
          (async () => {
            if (!ws.userId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Authentication required for chat.' }));
              return;
            }

            const rateLimitCheck = checkRateLimit(ws.userId);
            if (!rateLimitCheck.allowed) {
              ws.send(JSON.stringify({ type: 'error', message: 'Too many messages. Please try again in a moment.', retryAfterMs: rateLimitCheck.retryAfterMs }));
              return;
            }

            try {
              const inputSchema = z.object({
                message: z.string(),
                module: z.enum(['trading', 'writers', 'reels']).optional(),
                language: z.string().optional(),
              });
              const input = inputSchema.parse(data.payload);

              await storage.createChatMessage({
                content: input.message,
                sender: 'user',
                userId: ws.userId,
              });

              const history = await storage.getChatMessages(ws.userId);
              const conversationHistory = history.slice(-20).map((m) => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.content,
              }));

              const prefs = await storage.getUserPreferences(ws.userId);
              const userPrefs = {
                ...(prefs || {}),
                language: input.language || prefs?.language,
              };

              const { response: aiResponseContent, detectedMood } = await getMaraResponse(
                input.message,
                conversationHistory,
                userPrefs,
                input.module,
                ws.userId,
              );

              const aiMsg = await storage.createChatMessage({
                content: aiResponseContent,
                sender: 'ai',
                userId: ws.userId,
              });

              ws.send(JSON.stringify({ type: 'chat-response', payload: { aiResponse: aiMsg, mood: detectedMood } }));
            } catch (err) {
              logError(err, { message: 'Chat processing failed via WebSocket' });
              ws.send(JSON.stringify({ type: 'error', message: 'Failed to process chat message.' }));
            }
          })();
          break;

        default:
          log(`Received unknown P2P message type: ${data.type}`, 'p2p-ws');
      }
    });

    ws.on('close', () => {
      if (ws.userId) {
        log(`P2P user disconnected: ${ws.userId}`, 'p2p-ws');
        userConnections.delete(ws.userId);
        clearSeedsForUser(ws.userId);
      } else {
        log('Anonymous P2P user disconnected.', 'p2p-ws');
      }
    });
  });
  log('P2P Signaling Server is attached to the main HTTP server.', 'p2p-ws');
  // --- END P2P WEBSOCKET INTEGRATION ---

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
  process.exit(1);
});
