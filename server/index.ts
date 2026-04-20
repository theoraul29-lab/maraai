import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { logError } from './logger.js';
import type { Request, Response, NextFunction } from 'express';
import { registerRoutes } from './routes.js';
import { serveStatic } from './static.js';
import { createServer } from 'http';
import { brainManager } from './mara-brain/index.js';
import { getMaraResponse } from './ai.js';
import { WebSocketServer } from 'ws';
import url from 'url';
import { storage } from './storage.js';
import { setupSessionAuth } from './auth.js';
import { checkRateLimit } from './rate-limit.js';
import * as authApi from './modules/auth-api.js';
import * as oauthGoogle from './modules/oauth-google.js';
import * as oauthFacebook from './modules/oauth-facebook.js';
import { registerBillingApi } from './billing/api.js';
import { seedPlans } from './billing/seed.js';
import { seedTradingAcademy } from './trading/seed.js';
import { z } from 'zod';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { UPLOADS_DIR } from '../backend/src/modules/reels.js';
dotenv.config();

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
}


const app = express();

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

// Real auth endpoints (email + password). Backs the frontend AuthContext.
app.post('/api/auth/signup', authApi.signup);
app.post('/api/auth/login', authApi.login);
app.post('/api/auth/logout', authApi.logout);
app.get('/api/auth/me', authApi.me);
app.post('/api/auth/oauth/:provider', authApi.oauth);

// Google OAuth 2.0 — redirect flow. See server/modules/oauth-google.ts.
app.get('/api/auth/google', oauthGoogle.startGoogle);
app.get('/api/auth/google/callback', oauthGoogle.googleCallback);

// Facebook OAuth 2.0 — redirect flow. See server/modules/oauth-facebook.ts.
app.get('/api/auth/facebook', oauthFacebook.startFacebook);
app.get('/api/auth/facebook/callback', oauthFacebook.facebookCallback);

// Subscription / billing endpoints. Public plan catalogue + authed
// `/me`, `/subscribe` (503 until PAYMENTS_ENABLED + provider keys), `/cancel`.
registerBillingApi(app);

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
      if (capturedJsonResponse) { // Va fi populat doar dacă nu suntem în producție
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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
    const userId = url.parse(req.url || '', true).query.userId as string;
    // ID-ul utilizatorului va veni de la JWT Auth
    const authUserId = req.user?.uid;
    const finalUserId = userId || authUserId;
    if (finalUserId) {
      log(`P2P user connected: ${userId}`, 'p2p-ws');
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
})();
