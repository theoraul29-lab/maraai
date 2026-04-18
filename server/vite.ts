// Helper to ensure we always pass an Error object
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === "object" && e && "message" in e) {
    return new Error((e as any).message);
  }
  return new Error(String(e));
}
import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

// Polyfill __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  let viteConfig;
  try {
    viteConfig = (await import("../vite.config.js")).default;
  } catch {
    viteConfig = {};
  }
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Correct Express catch-all route (Express 4 compatible wildcard)
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "frontend",
        "index.html",
      );
      // always reload the index.html file from disk in case it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        "src=\"/src/main.tsx\"",
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      const err = toError(e);
      vite.ssrFixStacktrace(err);
      next(err);
    }
  });
}
