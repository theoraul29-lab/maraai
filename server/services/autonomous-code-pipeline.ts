/**
 * Faza 3 — code-write request pipeline, revised: a real human approval click
 * is required before any code Mara proposes (from chat, or from her own
 * module analyzers) reaches git. This module used to self-approve every
 * step (plan -> apply -> validate -> stage -> commit -> push) with no human
 * in the loop; that self-approval is removed. What both entry points below
 * now do is identical to the first half of the existing, already-audited
 * manual Control Center flow: create the request, have the LLM plan it, and
 * stop — the plan sits in `waiting_approval` until an admin reviews it and
 * clicks Approve in Control Center (POST /api/control/code-agent/plans/:id/
 * approve), exactly like a plan a human typed into Control Center directly.
 * Nothing about the approval/apply/validate/commit/push machinery itself
 * changed — see code-agent.ts and control-task-engine.ts — only who is
 * allowed to press "go" on it.
 */
import { llmGenerate } from '../llm.js';
import {
  createCodeAgentRequestWithTask,
  planCodeAgentRequest,
  type CodeAgentModuleContext,
} from './code-agent.js';

// Confirmed live: bare "platform" matched ordinary Romanian words like
// "platformă"/"platformei" in completely unrelated requests (e.g. "fă un
// audit al platformei hellomara.net"), pre-filtering them into the LLM
// confirmation step below — and from there into a slow autonomous-pipeline
// run instead of a normal, immediate chat reply. Removed; the remaining
// keywords are already specific action verbs that a status/audit/check
// request wouldn't contain.
const CODE_INTENT_KEYWORDS = /\b(implement|implementeaz|cod(ul)?|funcț|functi|feature|bug|repar|fix|adaug|schimb|modific|scrie.*cod)/i;

/** Cheap keyword pre-filter, then a strict LLM confirmation — conservative on purpose. */
export async function detectCodeWriteIntent(message: string): Promise<boolean> {
  if (message.length < 8 || !CODE_INTENT_KEYWORDS.test(message)) return false;
  try {
    const raw = await llmGenerate(
      `Owner message to Mara (Romanian or English): "${message.slice(0, 2000)}"\n\n` +
      `Is this an explicit instruction for Mara to write, modify, or implement code in the MaraAI platform repository right now? ` +
      `Answer NO for: a question, a status check, an audit/review/analysis request ("check", "audit", "look at", "verify", "what's wrong with"), ` +
      `a bug REPORT with no fix requested, or casual conversation — even if it mentions bugs, code, or the platform. ` +
      `Answer YES only for an explicit instruction to write/change/fix code now (e.g. "fix this", "implement X", "add a button that..."). ` +
      `Answer with exactly one word: YES or NO.`,
      { source: 'admin.mara_chat.intent', temperature: 0 },
    );
    return /^\s*YES\b/i.test(raw);
  } catch {
    return false;
  }
}

// Files/content that must never be auto-committed by Mara's own module
// analyzers, even though writers/missions autonomy is fully approved — money
// movement (PayPal orders, payouts, the 90/10 split) stays a human click.
// This is narrower than the owner-instructed chat path (handleAutonomousCodeRequest
// above), which used to be exempted from any approval click at all before
// this file removed self-approval entirely; kept as extra context in the
// held-for-review message below (payment/payout plans are worth a reviewer
// knowing to look closer at), not as a behavior branch anymore — every
// proposal is held for review now, not just payment-sensitive ones.
const PAYMENT_SENSITIVE_PATH_PREFIXES = ['server/billing/'];
const PAYMENT_SENSITIVE_KEYWORDS = [
  'pricecents', 'amountcents', 'authorsharecents', 'platformsharecents',
  'paypalpayoutemail', 'sendpaypalpayout', 'createpaypalorder', 'capturepaypalorder',
  'creator_revenue_share', 'payments_enabled', 'payment_system_active',
  'payout_status', 'payoutstatus', 'paypal',
];

function isPaymentSensitiveChange(change: Record<string, unknown>): boolean {
  const changePath = String(change.path ?? '').toLowerCase();
  if (PAYMENT_SENSITIVE_PATH_PREFIXES.some((prefix) => changePath.startsWith(prefix))) return true;
  const content = String(change.content ?? '').toLowerCase();
  return PAYMENT_SENSITIVE_KEYWORDS.some((keyword) => content.includes(keyword));
}

export interface ModuleProposalOutcome {
  outcome: 'held_for_review' | 'no_changes' | 'failed';
  detail: string;
  planId?: number;
}

/**
 * Plans a proposal Mara generated herself (the per-module growth analyzers)
 * and stops: the plan is left `waiting_approval`, same as any plan created
 * from Control Center directly, for a real admin to review and approve. This
 * function no longer applies/commits/pushes anything itself — see the file
 * header for why that changed.
 */
export async function autoApplyModuleProposal(
  description: string,
  moduleContext: CodeAgentModuleContext | null,
  actor: string,
): Promise<ModuleProposalOutcome> {
  const { request } = createCodeAgentRequestWithTask(description, 'medium', actor, moduleContext ?? undefined);
  try {
    const plan = await planCodeAgentRequest(request.id);
    if (!plan.changes.length) {
      return {
        outcome: 'no_changes',
        detail: typeof plan.analysis.summary === 'string' && plan.analysis.summary ? plan.analysis.summary : 'Nu am identificat o modificare de cod sigură de propus.',
        planId: plan.id,
      };
    }
    const paymentNote = plan.changes.some(isPaymentSensitiveChange)
      ? ' Atinge cod de plăți/venituri — revizuiește cu atenție sporită.'
      : '';
    return {
      outcome: 'held_for_review',
      detail: `Planul #${plan.id} e pregătit și așteaptă aprobare în Control Center.${paymentNote}`,
      planId: plan.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { outcome: 'failed', detail: message };
  }
}

/**
 * Plans a code change the owner asked for in chat and stops: the plan is
 * left `waiting_approval` for a real admin approval click in Control Center
 * — this function no longer applies/commits/pushes anything itself, see the
 * file header for why that changed.
 */
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
    return {
      reply: `Am pregătit un plan (#${plan.id}, ${plan.changes.length} fișier(e)) — aprobă-l în Control Center ca să fie aplicat.`,
      status: 'waiting_approval',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reply: `Am întâmpinat o eroare la pregătirea planului: ${message}`, status: 'error' };
  }
}
