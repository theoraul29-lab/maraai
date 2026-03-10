const { spawn } = require("child_process");

const BASE_URL = process.env.MARAAI_BASE_URL || "http://localhost:5000";
const STARTUP_TIMEOUT_MS = Number(process.env.MARAAI_STARTUP_TIMEOUT_MS || 45000);
const REQUEST_TIMEOUT_MS = Number(process.env.MARAAI_LEARNING_TIMEOUT_MS || 180000);

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

async function run() {
  let backendController = null;
  try {
    backendController = await ensureBackendRunning(BASE_URL);

    const body = {
      url: process.env.MARAAI_LEARNING_URL || "https://example.com",
      prompt:
        process.env.MARAAI_LEARNING_PROMPT ||
        "Give a short summary and 3 key facts.",
      browser: process.env.MARAAI_LEARNING_BROWSER || "chromium",
    };

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(`${BASE_URL}/api/maraai/python-fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: timeoutController.signal,
    });

    clearTimeout(timeoutId);

    const json = await response.json().catch(() => ({}));

    if (response.status !== 200) {
      console.error(`[smoke-learning] HTTP ${response.status}: ${JSON.stringify(json)}`);
      stopIfStartedBySmoke(backendController);
      process.exit(1);
    }

    const ok = json && json.ok === true && json.result;
    if (!ok) {
      console.error(`[smoke-learning] Unexpected response shape: ${JSON.stringify(json)}`);
      stopIfStartedBySmoke(backendController);
      process.exit(1);
    }

    const title = json.result.extracted_data?.title || "(no title)";
    console.log(`[smoke-learning] PASS title=\"${title}\" source=${body.url}`);
    stopIfStartedBySmoke(backendController);
  } catch (error) {
    console.error(`[smoke-learning] FAIL ${String(error)}`);
    stopIfStartedBySmoke(backendController);
    process.exit(1);
  }
}

run();
