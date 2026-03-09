function summarizeFindings(findings) {
  if (!findings.length) {
    return {
      status: "healthy",
      summary: "No recurring high-signal runtime patterns detected.",
      actions: [],
    };
  }

  const uniqueActions = Array.from(
    new Set(findings.map((item) => item.recommendation).filter(Boolean)),
  );

  return {
    status: "attention_required",
    summary: `Detected ${findings.length} actionable runtime pattern(s).`,
    actions: uniqueActions,
  };
}

function suggestFixes(analysis) {
  const findings = analysis.findings || [];
  return summarizeFindings(findings);
}

module.exports = {
  suggestFixes,
  summarizeFindings,
};
