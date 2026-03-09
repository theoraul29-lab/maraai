const { runFoundationCycle } = require("./aiFoundation");
const { analyzeRecentErrors } = require("./errorAnalysis");
const { getRecentLogs } = require("./logMonitor");
const { suggestFixes } = require("./devAssistant");

module.exports = {
  runFoundationCycle,
  analyzeRecentErrors,
  getRecentLogs,
  suggestFixes,
};
