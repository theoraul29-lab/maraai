const fs = require("fs");
const path = require("path");

const { runFoundationCycle } = require("../backend/modules");

const EVOLUTION_DIR = path.join(__dirname, "..", "logs", "evolution");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function main() {
  ensureDir(EVOLUTION_DIR);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = path.join(EVOLUTION_DIR, `autonomy-report-${timestamp}.json`);

  const report = runFoundationCycle({ limit: 400 });
  writeJson(reportFile, report);

  console.log(`[autonomy] Report written: ${reportFile}`);
  console.log(`[autonomy] Status: ${report.guidance?.status || "unknown"}`);
  console.log(`[autonomy] Summary: ${report.guidance?.summary || "n/a"}`);
}

main();
