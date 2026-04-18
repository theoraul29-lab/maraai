import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { logError } from './logger.js';
import type { Request, Response, NextFunction } from 'express';
import { registerRoutes } from './routes.js';
import { serveStatic } from './static.js';
import { createServer } from 'http';
import { runBrainCycle, runInitialLearning } from './mara-brain/index.js';
import { getMaraResponse, generateMarketingPost } from './ai.js';
import { WebSocketServer } from 'ws';
import url from 'url';
import { storage } from './storage.js';
import { setupSessionAuth } from './auth.js';
import { checkRateLimit } from './rateLimit.js';
import { z } from 'zod';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
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
      return callback(new Error('CORS not allowed'), false);
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

app.get('/api/auth/me', (req: any, res) => {
  res.json({ uid: req.user?.uid ?? null });
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

    const BRAIN_INTERVAL = 6 * 60 * 60 * 1000;
    const SELF_POST_INTERVAL = 4 * 60 * 60 * 1000;

    async function runAutoBrainCycle() {
      try {
        log('Auto brain cycle starting...', 'mara-brain');
        const result = await runBrainCycle();
        await storage.createBrainLog({
          research: result.research,
          productIdeas: result.productIdeas,
          devTasks: result.devTasks,
          growthIdeas: result.growthIdeas,
        });
        log(`Auto brain cycle completed. Learned ${result.knowledgeLearned} new pieces of knowledge.`, 'mara-brain');
      } catch (err) {
        log(`Auto brain cycle failed: ${err}`, 'mara-brain');
      }
    }

    async function runAutoSelfPost() {
      try {
        log('Auto self-marketing post starting...', 'mara-marketing');
        const postContent = await generateMarketingPost();
        await storage.createVideo({
          url: '#',
          type: 'creator',
          title: 'Mara AI Insight',
          description: postContent,
          creatorId: 'mara-ai',
        });
        log(
          `Auto self-marketing post published`,
          'mara-marketing',
        );
      } catch (err) {
        log(`Auto self-marketing post failed: ${err}`, 'mara-marketing');
      }
    }

    // Run initial learning bootstrap only when explicitly enabled (non-blocking)
    if (process.env.PROCESS_AI_TASKS === 'true') {
      runInitialLearning().catch((err) => {
        log(`Initial learning failed: ${err}`, 'mara-brain');
      });

      // Run first brain cycle after 30 seconds (let server fully start)
      setTimeout(runAutoBrainCycle, 30 * 1000);
      setInterval(runAutoBrainCycle, BRAIN_INTERVAL);
      setInterval(runAutoSelfPost, SELF_POST_INTERVAL);
      log(
        'Mara auto-scheduler started: brain cycle every 6h, self-post every 4h',
        'mara-scheduler',
      );
    } else {
      log(
        'Mara AI tasks disabled (initial learning + brain cycles). Set PROCESS_AI_TASKS=true to enable.',
        'mara-scheduler',
      );
    }
  }

  // Logica simplificată pentru pornirea serverului, ideală pentru Cloud Run
  httpServer.listen(requestedPort, runtimeState.host, () => {
    onServerReady(requestedPort);
  });
})();
