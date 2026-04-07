const { spawn } = require("child_process");

const BASE_URL = process.env.MARAAI_BASE_URL || "http://localhost:5000";
const STARTUP_TIMEOUT_MS = Number(process.env.MARAAI_STARTUP_TIMEOUT_MS || 45000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canReachHealth(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

function parseBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  const protocol = parsed.protocol === "https:" ? "https" : "http";
  const defaultPort = protocol === "https" ? 443 : 80;
  return {
    host: parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname,
    port: parsed.port ? Number(parsed.port) : defaultPort,
  };
}

async function ensureBackendRunning(baseUrl) {
  if (await canReachHealth(baseUrl)) {
    return { startedBySmoke: false, child: null };
  }

  const { host, port } = parseBaseUrl(baseUrl);
  const child = spawn("npm run start:backend", {
    shell: true,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
    },
    stdio: "inherit",
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (await canReachHealth(baseUrl)) {
      return { startedBySmoke: true, child };
    }
    await sleep(1000);
  }

  if (!child.killed) {
    child.kill("SIGTERM");
  }
  throw new Error(
    `Backend did not become healthy within ${STARTUP_TIMEOUT_MS}ms at ${baseUrl}.`,
  );
}

function stopIfStartedBySmoke(controller) {
  if (!controller?.startedBySmoke || !controller.child) {
    return;
  }

  if (!controller.child.killed) {
    controller.child.kill("SIGTERM");
  }
}

const checks = [
  { name: "health", path: "/api/health", expected: [200] },
  { name: "runtime", path: "/api/runtime", expected: [200] },
  { name: "auth-user", path: "/api/auth/user", expected: [200, 401] },
  { name: "videos", path: "/api/videos", expected: [200] },
  { name: "feed", path: "/api/mara-feed", expected: [200] },
  { name: "trading", path: "/api/trading/access", expected: [200, 401] },
  { name: "premium", path: "/api/premium/status", expected: [200, 401] },
  { name: "writers", path: "/api/writers/published", expected: [200] },
  {
    name: "notifications",
    path: "/api/notifications",
    expected: [200, 401],
  },
];

async function run() {
  let backendController = null;
  try {
    backendController = await ensureBackendRunning(BASE_URL);
  } catch (error) {
    console.error(`[smoke] Failed to prepare backend: ${String(error)}`);
    process.exit(1);
  }

  const summary = [];

  for (const check of checks) {
    const url = `${BASE_URL}${check.path}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const body = await response.text();
      const expectedStatuses = check.expected || [200];
      summary.push({
        name: check.name,
        status: response.status,
        ok: expectedStatuses.includes(response.status),
        bodyPreview: body.slice(0, 200),
      });
    } catch (error) {
      summary.push({
        name: check.name,
        status: 0,
        ok: false,
        bodyPreview: String(error),
      });
    }
  }

  const failed = summary.filter((item) => !item.ok);

  console.log(`[smoke] Base URL: ${BASE_URL}`);
  for (const item of summary) {
    console.log(`[smoke] ${item.name}: ${item.status} ${item.ok ? "OK" : "FAIL"}`);
  }

  if (failed.length > 0) {
    console.log("[smoke] Failures:");
    for (const item of failed) {
      console.log(`- ${item.name}: ${item.bodyPreview}`);
    }
    stopIfStartedBySmoke(backendController);
    process.exit(1);
  }

  console.log("[smoke] All runtime checks passed.");
  stopIfStartedBySmoke(backendController);
}

run();
