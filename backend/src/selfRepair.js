const fs = require("fs");
const path = require("path");
const logFile = path.join(__dirname, "../../logs/maraai.log");

function checkForRepeatedErrors() {
  if (!fs.existsSync(logFile)) return;
  const lines = fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean);
  const errors = lines.filter((line) => line.includes('"type":"error"'));
  if (errors.length > 10) {
    // Example: trigger a notification or auto-repair action
    console.warn(
      "High error rate detected! Consider restarting or running npm install.",
    );
  }
}

module.exports = { checkForRepeatedErrors };
