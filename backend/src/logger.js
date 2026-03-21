const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../../logs/maraai.log');

function logEvent(type, data) {
  const entry =
    `${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n`;
  fs.appendFileSync(logFile, entry, 'utf8');
}

module.exports = { logEvent };
