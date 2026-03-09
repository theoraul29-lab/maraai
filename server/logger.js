import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, "../logs");
const errorLogPath = path.join(logDir, "errors.log");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

export function logError(error, context = {}) {
  const entry = {
    time: new Date().toISOString(),
    message: error.message,
    stack: error.stack,
    ...context,
  };
  fs.appendFileSync(errorLogPath, JSON.stringify(entry) + "\n");
}
