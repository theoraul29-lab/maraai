/**
 * Faza 3 — autonomous code-write pipeline.
 *
 * The owner explicitly chose full autonomy: no human approval click between
 * "Mara, implement X" and code landing on `main`. The technical safety net
 * that replaces the click is unchanged from the rest of the Control Center:
 * protected paths (server/services/repository-modifier.ts), backup+rollback
 * on every file write, and — the new piece — an automatic, non-negotiable
 * typecheck/build gate. If that gate fails, the chain stops before anything
 * reaches git; nothing broken is ever committed.
 *
 * Every step below still goes through the same control-task-engine rows,
 * risk classification, and audit trail as the admin-driven manual flow — the
 * only difference is that this orchestrator calls approveControlTask /
 * reviewControlTask itself instead of waiting for a human to click them.
 */
import { llmGenerate } from '../llm.js';
import {
  approveCodeAgentPlan,
  createCodeAgentRequestWithTask,
  getCodeAgentPlan,
  planCodeAgentRequest,
  type CodeAgentPlanRow,
} from './code-agent.js';
import {
  approveControlTask,
  createControlTask,
  findValidationTaskForProposal,
  reviewControlTask,
  type ControlTaskRow,
} from './control-task-engine.js';
import { runOneControlTask } from '../bootstrap/control-task-worker.js';

const CODE_INTENT_KEYWORDS = /\b(implement|implementeaz|cod(ul)?|funcț|functi|feature|bug|repar|fix|adaug|schimb|modific|scrie.*cod|platform)/i;

export interface AutoCodeOutcome {
  outcome: 'committed' | 'rejected' | 'failed';
  detail: string;
  commitMessage?: string;
  filesChanged?: string[];
}

/** Cheap keyword pre-filter, then a strict LLM confirmation — conservative on purpose. */
export async function detectCodeWriteIntent(message: string): Promise<boolean> {
  if (message.length < 8 || !CODE_INTENT_KEYWORDS.test(message)) return false;
  try {
    const raw = await llmGenerate(
      `Owner message to Mara (Romanian or English): "${message.slice(0, 2000)}"\n\n` +
      `Is this an explicit instruction for Mara to write, modify, or implement code in the MaraAI platform repository — ` +
      `not a question, not a status check, not casual conversation? Answer with exactly one word: YES or NO.`,
      { source: 'admin.mara_chat.intent', temperature: 0 },
    );
    return /^\s*YES\b/i.test(raw);
  } catch {
    return false;
  }
}

async function runAndAwait(taskId: number): Promise<ControlTaskRow | null> {
  return runOneControlTask(taskId);
}

/**
 * Chains what the manual Control Center flow requires separate approval
 * clicks for: apply → automatic typecheck/build gate → stage → commit →
 * push. Stops at the first failure; the automatic gate is what decides
 * whether code ever reaches git, not a human.
 */
export async function autoApplyCodeAgentPlan(planId: number, actor: string): Promise<AutoCodeOutcome> {
  const plan = getCodeAgentPlan(planId);
  if (!plan) throw new Error(`Code Agent plan not found: ${planId}`);
  if (!plan.changes.length) {
    return { outcome: 'rejected', detail: 'Plan propunea zero modificări — nimic de aplicat.' };
  }

  const approved = approveCodeAgentPlan(planId, actor);
  if (!approved) throw new Error(`Plan ${planId} is not awaiting approval`);

  const approvedApplyTask = approveControlTask(approved.task.id, actor);
  if (!approvedApplyTask) return { outcome: 'failed', detail: 'Nu am putut aproba automat task-ul de aplicare a modificărilor.' };
  const applied = await runAndAwait(approvedApplyTask.id);
  if (!applied || applied.status !== 'COMPLETED') {
    return { outcome: 'failed', detail: `Aplicarea modificărilor a eșuat: ${applied?.error ?? 'stare necunoscută'}` };
  }

  const validationTask = findValidationTaskForProposal(applied.id);
  if (!validationTask) return { outcome: 'failed', detail: 'Task-ul de validare (typecheck/build) nu a fost creat automat.' };
  const validated = await runAndAwait(validationTask.id);
  const validationPassed = validated?.status === 'COMPLETED';
  reviewControlTask(validationTask.id, validationPassed ? 'approved' : 'rejected', actor);
  if (!validationPassed) {
    return {
      outcome: 'rejected',
      detail: `Poarta automată de corectitudine (${validationTask.taskType}) a eșuat — modificările NU au fost trimise în git. Fișierele scrise rămân, dar pot fi restaurate din backup.`,
    };
  }

  const filePaths = plan.changes.map((change) => String(change.path));
  const stageTask = createControlTask({
    taskType: 'git.stage_proposal',
    title: `Stage Code Agent plan #${planId}`,
    payload: { paths: filePaths, proposalTaskId: applied.id, validationTaskId: validationTask.id },
    priority: 'high',
    createdBy: actor,
    assignedAgent: 'code-agent',
  });
  approveControlTask(stageTask.id, actor);
  const staged = await runAndAwait(stageTask.id);
  if (!staged || staged.status !== 'COMPLETED') {
    return { outcome: 'failed', detail: `Stage-ul modificărilor în git a eșuat: ${staged?.error ?? 'stare necunoscută'}` };
  }

  const commitMessage = buildCommitMessage(plan, planId);
  const commitTask = createControlTask({
    taskType: 'git.commit_staged',
    title: `Commit Code Agent plan #${planId}`,
    payload: { message: commitMessage, proposalTaskId: applied.id, validationTaskId: validationTask.id },
    priority: 'high',
    createdBy: actor,
    assignedAgent: 'code-agent',
  });
  approveControlTask(commitTask.id, actor);
  const committed = await runAndAwait(commitTask.id);
  if (!committed || committed.status !== 'COMPLETED') {
    return { outcome: 'failed', detail: `Commit-ul a eșuat: ${committed?.error ?? 'stare necunoscută'}` };
  }

  const pushTask = createControlTask({
    taskType: 'git.push',
    title: `Push Code Agent plan #${planId}`,
    payload: { commitTaskId: commitTask.id },
    priority: 'high',
    createdBy: actor,
    assignedAgent: 'code-agent',
  });
  approveControlTask(pushTask.id, actor);
  const pushed = await runAndAwait(pushTask.id);
  if (!pushed || pushed.status !== 'COMPLETED') {
    return { outcome: 'failed', detail: `Push-ul către GitHub a eșuat: ${pushed?.error ?? 'stare necunoscută'}. Commit-ul există local pe laptop, dar nu a ajuns pe main.` };
  }

  return {
    outcome: 'committed',
    detail: `${filePaths.length} fișier(e) modificate și trimise pe main: ${commitMessage}. Railway va redeploya automat.`,
    commitMessage,
    filesChanged: filePaths,
  };
}

function buildCommitMessage(plan: CodeAgentPlanRow, planId: number): string {
  const summary = typeof plan.analysis.summary === 'string' && plan.analysis.summary.trim()
    ? plan.analysis.summary.trim().split('\n')[0].slice(0, 100)
    : `Autonomous change from Code Agent plan #${planId}`;
  return `${summary}\n\nCo-Authored-By: Mara <mara@hellomara.net>`;
}

export async function handleAutonomousCodeRequest(description: string, actor: string): Promise<{ reply: string; status: string }> {
  const { request } = createCodeAgentRequestWithTask(description, 'high', actor);
  try {
    const plan = await planCodeAgentRequest(request.id);
    if (!plan.changes.length) {
      return {
        reply: `Am analizat cererea, dar nu am identificat o modificare de cod sigură de propus.${plan.analysis.summary ? ` ${plan.analysis.summary}` : ''}`,
        status: 'no_changes',
      };
    }
    const result = await autoApplyCodeAgentPlan(plan.id, actor);
    if (result.outcome === 'committed') {
      return { reply: `Am implementat modificarea și am trimis-o în producție.\n\n${result.detail}`, status: 'committed' };
    }
    return { reply: `Nu am finalizat automat implementarea: ${result.detail}`, status: result.outcome };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reply: `Am întâmpinat o eroare la implementare: ${message}`, status: 'error' };
  }
}
