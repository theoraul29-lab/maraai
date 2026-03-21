const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const ERROR_LOG = path.join(LOG_DIR, 'errors.log');
const RUNTIME_LOG = path.join(LOG_DIR, 'mara.log');

function readLogLines(filePath, limit = 200) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return [];
  const lines = content.split('\n').filter(Boolean);
  return lines.slice(Math.max(0, lines.length - limit));
}

function getRecentLogs(options = {}) {
  const limit = Number(options.limit || 200);
  return {
    errors: readLogLines(ERROR_LOG, limit),
    runtime: readLogLines(RUNTIME_LOG, limit),
  };
}

module.exports = {
  getRecentLogs,
  readLogLines,
  paths: {
    LOG_DIR,
    ERROR_LOG,
    RUNTIME_LOG,
  },
};
