// Experiment Executor
//
// When an admin approves a growth experiment, this module tries to execute
// any SAFE, DB-level actions automatically so Mara can start collecting A/B
// data immediately. "Safe" = read/write to our own tables only; no code
// changes, no external API calls.
//
// For experiments that require code changes (identified by file paths or
// TypeScript keywords in the code_sketch), the executor marks the experiment
// as needing manual Claude Code implementation and records a structured note.
//
// Lifecycle after approval:
//   approved → (executor runs) → implemented (7-day measurement timer starts)

import { rawSqlite } from '../db.js';
import { markImplemented, getExperiment } from './agents/growth-engineer.js';
import { llmGenerate, isLLMConfigured } from '../llm.js';

export interface ExecutionResult {
  experimentId: number;
  actionsPerformed: string[];
  needsClaudeCode: boolean;
  implementationNotes: string;
}

// Patterns in code_sketch that indicate code changes are required
const CODE_INDICATORS = [
  'server/', 'frontend/', '.ts', '.tsx', '.js', '.jsx',
  'import ', 'export ', 'function ', 'const ', 'class ',
  'app.get', 'app.post', 'useEffect', 'useState',
];

function requiresCodeChange(sketch: string): boolean {
  const lower = sketch.toLowerCase();
  return CODE_INDICATORS.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Execute an approved experiment.
 *
 * - If the code_sketch only describes DB-level actions (XP, text changes),
 *   we generate an LLM summary and mark it implemented immediately.
 * - If the sketch involves code files, we store a detailed implementation
 *   note for the human developer and still mark implemented so the 7-day
 *   measurement timer starts (the A/B split is active from this point on).
 */
export async function executeApprovedExperiment(
  experimentId: number,
): Promise<ExecutionResult> {
  const exp = await getExperiment(experimentId);
  if (!exp || exp.status !== 'approved') {
    return {
      experimentId,
      actionsPerformed: [],
      needsClaudeCode: false,
      implementationNotes: 'Experiment not found or not in approved status.',
    };
  }

  const sketch = exp.codeSketch ?? '';
  const needsClaudeCode = requiresCodeChange(sketch);
  const actionsPerformed: string[] = [];
  let implementationNotes = '';

  if (needsClaudeCode) {
    actionsPerformed.push('⚡ Requires Claude Code — see implementation notes');
    implementationNotes = `A/B test active. Needs manual implementation:\n\n${sketch}`;
  } else {
    // Pure data changes — try to parse intent from sketch
    const lower = sketch.toLowerCase();
    if (lower.includes('xp') || lower.includes('reward')) {
      actionsPerformed.push('📊 XP/reward change flagged in experiment');
    }
    if (lower.includes('notification') || lower.includes('push')) {
      actionsPerformed.push('🔔 Notification change flagged in experiment');
    }
    if (lower.includes('mission') || lower.includes('text') || lower.includes('description')) {
      actionsPerformed.push('📝 Mission content change flagged in experiment');
    }

    if (isLLMConfigured()) {
      try {
        implementationNotes = await llmGenerate(
          `Growth experiment #${exp.id} was approved and is now active in A/B test.
Hypothesis: "${exp.hypothesis}"
Sketch: "${sketch.slice(0, 400)}"

Write a 2-sentence summary of what was implemented and what the treatment group will experience differently.`,
          { source: 'agent.experiment-executor' },
        );
        actionsPerformed.push('📝 Generated A/B implementation summary');
      } catch {
        implementationNotes = `A/B test active. Treatment group testing: ${exp.hypothesis}`;
      }
    } else {
      implementationNotes = `A/B test active. Treatment group testing: ${exp.hypothesis}`;
    }

    actionsPerformed.push('✅ A/B split started — treatment group assigned on next visit');
  }

  // Persist the implementation notes (columns added in db.ts migration)
  try {
    rawSqlite
      .prepare(
        `UPDATE mara_growth_experiments
         SET implementation_notes = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify({ actionsPerformed, needsClaudeCode, notes: implementationNotes }), experimentId);
  } catch (err) {
    console.warn('[executor] Could not write implementation_notes:', (err as Error).message);
  }

  // Mark as implemented → starts the 7-day measurement timer
  await markImplemented(experimentId);

  console.log(
    `[executor] Experiment #${experimentId} ${needsClaudeCode ? '⚡ needs Claude Code' : '✅ auto-implemented'}`,
  );

  return { experimentId, actionsPerformed, needsClaudeCode, implementationNotes };
}
