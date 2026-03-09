const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

// All API modules are now registered via server/routes.ts for consistency.
const chatApi = require("./api/chat");
const reelsApi = require("./api/reels");
const feedbackApi = require("./api/feedback");
const marketingApi = require("./api/marketing");
const paymentsApi = require("./api/payments");
const academyApi = require("./api/academy");
const voiceaiApi = require("./api/voiceai");
const adminApi = require("./api/admin");
const authApi = require("./api/auth");
const p2pApi = require("./api/p2p");
const logApi = require("./api/log");
const { logEvent } = require("./logger");
const { checkForRepeatedErrors } = require("./selfRepair");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// User interaction logging middleware
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/health")) {
    logEvent("user_interaction", {
      method: req.method,
      path: req.path,
      body: req.body,
    });
  }
  next();
});

// API routes
app.use("/api/chat", chatApi);
app.use("/api/reels", reelsApi);
app.use("/api/feedback", feedbackApi);
app.use("/api/marketing", marketingApi);
app.use("/api/payments", paymentsApi);
app.use("/api/academy", academyApi);
app.use("/api/voiceai", voiceaiApi);
app.use("/api/admin", adminApi);
app.use("/api/auth", authApi);
app.use("/api/p2p", p2pApi);
app.use("/api/log", logApi);

// Serve frontend static files (production build)
const distDir = path.join(__dirname, "../../frontend/dist");
const publicDir = path.join(distDir, "public");
const assetsDir = path.join(distDir, "assets");

// Serve assets and public files
app.use("/assets", express.static(assetsDir));
app.use(express.static(publicDir));

// Catch-all: serve index.html for SPA routes (not API or assets)
app.get(/^\/(?!api|assets).*/, (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Global error handler
app.use((err, req, res, next) => {
  logEvent("error", { message: err.message, stack: err.stack, path: req.path });
  res
    .status(500)
    .json({ error: "Internal server error", details: err.message });
});

// Self-repair periodic check
setInterval(checkForRepeatedErrors, 60000); // every minute

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MaraAI backend running on port ${PORT}`);
});
