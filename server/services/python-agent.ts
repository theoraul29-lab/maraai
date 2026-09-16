/**
 * "Write, run, and self-correct a Python script" — the autonomous chat
 * surface for the sandbox in python-sandbox.ts. Mirrors the exact pattern
 * already used for code-write intent (autonomous-code-pipeline.ts): a cheap
 * keyword pre-filter, then a strict LLM YES/NO confirmation before doing
 * anything, kept conservative on purpose. Wired into the SAME admin-only
 * chat endpoint, checked right after the code-write check so an owner
 * instruction routes to whichever one actually applies.
 *
 * One self-correction pass: if the first run errors (not just times out),
 * the script and its own error are shown back to the model once, asking for
 * a fix. This is the "test, and fix" half of the ask — a real, if modest,
 * iteration loop, not just single-shot execution.
 */
import { llmGenerate } from '../llm.js';
import { runPythonScript } from './python-sandbox.js';

const PYTHON_INTENT_KEYWORDS = /\b(python|script(ul)?|calculeaz|analizează|rulează|run\s+(a|this)\s+script|write\s+a\s+script)\b/i;

export async function detectPythonExecutionIntent(message: string): Promise<boolean> {
  if (message.length < 8 || !PYTHON_INTENT_KEYWORDS.test(message)) return false;
  try {
    const raw = await llmGenerate(
      `Owner message to Mara (Romanian or English): "${message.slice(0, 2000)}"\n\n` +
      `Is this an explicit instruction for Mara to write and run a Python script to compute, analyze, or demonstrate something — ` +
      `NOT a request to change the MaraAI platform's own application code, not a question, not casual conversation? ` +
      `Answer with exactly one word: YES or NO.`,
      { source: 'admin.mara_chat.python_intent', temperature: 0 },
    );
    return /^\s*YES\b/i.test(raw);
  } catch {
    return false;
  }
}

export interface PythonAgentOutcome {
  reply: string;
  status: 'ran' | 'failed' | 'error';
}

function stripCodeFences(raw: string): string {
  return raw.replace(/^```(?:python)?\s*\n?/i, '').replace(/```\s*$/i, '').trim();
}

export async function handlePythonExecutionRequest(description: string, actor: string): Promise<PythonAgentOutcome> {
  try {
    const writePrompt = `You are Mara's sandboxed Python assistant. The owner asked: "${description.slice(0, 4000)}"\n\n` +
      `Write a single, complete, self-contained Python script (standard library only — no pip packages are installed in the sandbox) that accomplishes this. ` +
      `Return ONLY the raw Python code — no markdown code fences, no commentary.`;
    const rawCode = await llmGenerate(writePrompt, { source: 'agent.python-agent.write', temperature: 0.2 });
    let code = stripCodeFences(rawCode);
    if (!code) return { reply: 'Nu am putut genera un script pentru această cerere.', status: 'error' };

    let result = await runPythonScript(code);

    if (!result.ok && !result.timedOut) {
      const fixPrompt = `This Python script failed:\n\n${code}\n\nError:\n${result.stderr.slice(0, 2000)}\n\n` +
        `Fix it. Return ONLY the corrected, complete Python code — no markdown fences, no commentary.`;
      try {
        const rawFixed = await llmGenerate(fixPrompt, { source: 'agent.python-agent.fix', temperature: 0.2 });
        const fixedCode = stripCodeFences(rawFixed);
        if (fixedCode) {
          const retried = await runPythonScript(fixedCode);
          if (retried.ok) {
            code = fixedCode;
            result = retried;
          } else {
            result = retried; // show the retried attempt's error — it's the more recent/relevant one
            code = fixedCode;
          }
        }
      } catch {
        // Keep the original attempt's result if the fix pass itself fails.
      }
    }

    const codeBlock = `\`\`\`python\n${code}\n\`\`\``;
    if (result.ok) {
      const outputBlock = result.stdout.trim() ? `\n\nOutput:\n${result.stdout.slice(0, 3000)}` : '\n\n(Scriptul a rulat cu succes, fără output.)';
      return { reply: `Am scris și rulat scriptul:\n\n${codeBlock}${outputBlock}`, status: 'ran' };
    }
    const failureNote = result.timedOut ? 'Scriptul a depășit limita de timp și a fost oprit.' : 'Scriptul a rulat cu erori.';
    const errorBlock = result.stderr.trim() ? `\n\nEroare:\n${result.stderr.slice(0, 1500)}` : '';
    return { reply: `${failureNote}\n\n${codeBlock}${errorBlock}`, status: 'failed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reply: `Am întâmpinat o eroare la scrierea/rularea scriptului: ${message}`, status: 'error' };
  }
}
