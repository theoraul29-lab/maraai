const { getRecentLogs } = require("./logMonitor");

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function detectPatterns(entries) {
  const findings = [];

  entries.forEach((entry) => {
    const text = String(entry.message || entry.raw || "");
    if (!text) return;

    if (/Cannot find module|Cannot find package/i.test(text)) {
      findings.push({
        type: "missing_dependency",
        severity: "high",
        message: text,
        recommendation: "Install the missing dependency and lock the version in package.json.",
      });
    }

    if (/ENOENT|no such file or directory/i.test(text)) {
      findings.push({
        type: "missing_path",
        severity: "medium",
        message: text,
        recommendation: "Validate absolute/relative paths and ensure required files exist at runtime.",
      });
    }

    if (/EADDRINUSE/i.test(text)) {
      findings.push({
        type: "port_conflict",
        severity: "low",
        message: text,
        recommendation: "Ensure only one server instance binds each port, or use a configurable fallback port.",
      });
    }
  });

  return findings;
}

function analyzeRecentErrors(options = {}) {
  const logs = getRecentLogs({ limit: options.limit || 200 });
  const normalized = logs.errors
    .map((line) => safeJsonParse(line))
    .filter(Boolean)
    .map((entry) => ({
      message: entry.message,
      raw: JSON.stringify(entry),
      time: entry.time || null,
    }));

  const findings = detectPatterns(normalized);
  return {
    analyzedAt: new Date().toISOString(),
    errorCount: normalized.length,
    findings,
  };
}

module.exports = {
  analyzeRecentErrors,
  detectPatterns,
};
