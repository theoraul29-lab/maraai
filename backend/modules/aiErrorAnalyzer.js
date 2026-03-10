// Mara Dev Assistant: AI Error Analyzer
// Reads error logs, identifies patterns, and suggests fixes

const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "../../logs/mara.log");
const suggestionFile = path.join(__dirname, "../../logs/suggestions.json");

function readErrorLog() {
  if (!fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean);
  return lines
    .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
    })
    .filter(Boolean);
}

function analyzeErrors(errors) {
  const suggestions = [];
  errors.forEach((entry) => {
    const { data } = entry;
    if (!data || !data.message) return;
    // Example pattern: missing dependency
    if (/Cannot find module/.test(data.message)) {
      suggestions.push({
        type: "dependency",
        message: data.message,
        fix: "Run npm install for missing module.",
      });
    }
    // Example pattern: path error
    if (/ENOENT|not found/.test(data.message)) {
      suggestions.push({
        type: "path",
        message: data.message,
        fix: "Check file path and existence.",
      });
    }
    // Add more patterns as needed
  });
  return suggestions;
}

function writeSuggestions(suggestions) {
  fs.writeFileSync(suggestionFile, JSON.stringify(suggestions, null, 2));
}

function runAnalysis() {
  const errors = readErrorLog();
  const suggestions = analyzeErrors(errors);
  writeSuggestions(suggestions);
  return suggestions;
}

module.exports = { runAnalysis, readErrorLog, analyzeErrors, writeSuggestions };