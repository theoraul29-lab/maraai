import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import { createServer } from "http";
import { MaraBrainCycle, generateMarketingPost } from "./ai.js";
import { storage } from "./storage.js";
const app = express();
const httpServer = createServer(app);
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));
export function log(message, source = "express") {
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
  let capturedJsonResponse = undefined;
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
  app.use((err, _req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
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
  const port = parseInt(process.env.PORT || "5000", 10);
  log(`Using DATABASE_URL: ${process.env.DATABASE_URL}`);
  httpServer.listen(port, () => {
    log(`serving on port ${port}`);
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
  });
})();
