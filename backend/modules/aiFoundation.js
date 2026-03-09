const { analyzeRecentErrors } = require("./errorAnalysis");
const { suggestFixes } = require("./devAssistant");
const { getRecentLogs } = require("./logMonitor");

function runFoundationCycle(options = {}) {
  const logs = getRecentLogs({ limit: options.limit || 200 });
  const analysis = analyzeRecentErrors({ limit: options.limit || 200 });
  const guidance = suggestFixes(analysis);

  return {
    generatedAt: new Date().toISOString(),
    logsSummary: {
      errorLines: logs.errors.length,
      runtimeLines: logs.runtime.length,
    },
    analysis,
    guidance,
  };
}

module.exports = {
  runFoundationCycle,
};
