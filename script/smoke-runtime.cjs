const BASE_URL = process.env.MARAAI_BASE_URL || "http://localhost:5000";

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
    process.exit(1);
  }

  console.log("[smoke] All runtime checks passed.");
}

run();
