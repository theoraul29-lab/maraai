import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { logError } from "./logger.js";
import session from "express-session";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import { createServer } from "http";
import net from "net";
import { randomBytes } from "crypto";
import { MaraBrainCycle, generateMarketingPost } from "./ai.js";
import { storage } from "./storage.js";

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
  host: process.env.HOST || "0.0.0.0",
  startedAt: null,
};

// Session configuration
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET environment variable must be set in production.",
    );
  }
  // In development, generate a random ephemeral secret and warn
  sessionSecret = randomBytes(32).toString("hex");
  console.warn(
    "[session] SESSION_SECRET not set — using ephemeral secret (sessions will not persist across restarts). Set SESSION_SECRET in .env for stable dev sessions.",
  );
}
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  }),
);
const httpServer = createServer(app);

declare module "http" {
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
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/runtime", (_req, res) => {
  const displayHost =
    runtimeState.host === "0.0.0.0" ? "localhost" : runtimeState.host;
  const effectivePort = runtimeState.boundPort ?? runtimeState.requestedPort;
  const apiBaseUrl = effectivePort
    ? `http://${displayHost}:${effectivePort}`
    : null;

  res.status(200).json({
    ...runtimeState,
    apiBaseUrl,
  });
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const errorLog = {
      path: req.path,
      method: req.method,
      status,
      message,
      stack: err.stack,
      body: req.body,
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
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const requestedPort = parseInt(process.env.PORT || "5000", 10);
  runtimeState.requestedPort = requestedPort;
  const MAX_PORT_RETRIES = 20;
  log(`Using DATABASE_URL: ${process.env.DATABASE_URL}`);

  function onServerReady(boundPort: number) {
    runtimeState.boundPort = boundPort;
    runtimeState.startedAt = new Date().toISOString();
    log(`serving on port ${boundPort}`);
    const displayHost =
      runtimeState.host === "0.0.0.0" ? "localhost" : runtimeState.host;
    log(
      `Runtime URL: http://${displayHost}:${boundPort} (health: /api/health, runtime: /api/runtime)`,
      "runtime",
    );

    const BRAIN_INTERVAL = 6 * 60 * 60 * 1000;
    const SELF_POST_INTERVAL = 4 * 60 * 60 * 1000;

    async function runAutoBrainCycle() {
      try {
        log("Auto brain cycle starting...", "mara-brain");
        const result = await MaraBrainCycle();
        await storage.createBrainLog({
          research: result.research,
          productIdeas: result.productIdeas,
          devTasks: result.devTasks,
          growthIdeas: result.growthIdeas,
        });
        log("Auto brain cycle completed", "mara-brain");
      } catch (err) {
        log(`Auto brain cycle failed: ${err}`, "mara-brain");
      }
    }

    async function runAutoSelfPost() {
      try {
        log("Auto self-marketing post starting...", "mara-marketing");
        const post = await generateMarketingPost();
        await storage.createVideo({
          url: post.url,
          type: post.type,
          title: post.title,
          description: post.description,
          creatorId: "mara-ai",
        });
        log(
          `Auto self-marketing post published: ${post.title}`,
          "mara-marketing",
        );
      } catch (err) {
        log(`Auto self-marketing post failed: ${err}`, "mara-marketing");
      }
    }

    setInterval(runAutoBrainCycle, BRAIN_INTERVAL);
    setInterval(runAutoSelfPost, SELF_POST_INTERVAL);
    log(
      "Mara auto-scheduler started: brain cycle every 6h, self-post every 4h",
      "mara-scheduler",
    );
  }

  function checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const probe = net
        .createServer()
        .once("error", () => resolve(false))
        .once("listening", () => {
          probe.close(() => resolve(true));
        })
        .listen(port);
    });
  }

  async function resolveAvailablePort(startPort: number): Promise<number> {
    for (let attempt = 0; attempt <= MAX_PORT_RETRIES; attempt += 1) {
      const candidate = startPort + attempt;
      const isAvailable = await checkPortAvailable(candidate);
      if (isAvailable) {
        if (candidate !== startPort) {
          log(
            `Port ${startPort} in use, using fallback port ${candidate}`,
            "express",
          );
        }
        return candidate;
      }
    }

    throw new Error(
      `No available port found in range ${startPort}-${startPort + MAX_PORT_RETRIES}`,
    );
  }

  const boundPort = await resolveAvailablePort(requestedPort);
  httpServer.listen(boundPort, runtimeState.host, () => onServerReady(boundPort));
})();
