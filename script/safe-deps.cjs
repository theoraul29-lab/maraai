const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const EVOLUTION_DIR = path.join(ROOT, "logs", "evolution");
const SNAPSHOT_DIR = path.join(EVOLUTION_DIR, "snapshots");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runNpm(args) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(npmCommand, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
  });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function safeParseJson(text) {
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: true, raw: text };
  }
}

function backupManifestFiles(stamp) {
  const snapshotPath = path.join(SNAPSHOT_DIR, stamp);
  ensureDir(snapshotPath);

  const files = ["package.json", "package-lock.json"];
  for (const file of files) {
    const from = path.join(ROOT, file);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(snapshotPath, file));
    }
  }

  return snapshotPath;
}

function main() {
  ensureDir(EVOLUTION_DIR);
  ensureDir(SNAPSHOT_DIR);

  const shouldApply = process.argv.includes("--apply");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotPath = backupManifestFiles(timestamp);

  const outdated = runNpm(["outdated", "--json"]);
  const outdatedData = safeParseJson(outdated.stdout || outdated.stderr || "{}");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: shouldApply ? "apply" : "dry-run",
    snapshotPath,
    outdated: outdatedData,
    applyResult: null,
  };

  if (shouldApply) {
    const update = runNpm(["update"]);
    report.applyResult = {
      exitCode: update.status,
      stdout: update.stdout,
      stderr: update.stderr,
    };
  }

  const reportFile = path.join(EVOLUTION_DIR, `deps-report-${timestamp}.json`);
  writeJson(reportFile, report);

  console.log(`[autonomy] Dependency report written: ${reportFile}`);
  console.log(`[autonomy] Snapshot created: ${snapshotPath}`);
  console.log(`[autonomy] Mode: ${report.mode}`);
}

main();
