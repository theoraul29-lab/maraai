// ExecutiveReasoning — single decision-making authority that unifies the
// three Mara brains (conversational / autonomous / growth-engineer).
//
// Responsibilities:
//   tick()                   — called at the start of every brain cycle to
//                              refresh the shared CognitiveState from live DB
//   recordSignal()           — called fire-and-forget from the conversational
//                              brain after every user message
//   getContextForConversation() — returns a compact string injected into the
//                              system prompt so Mara knows the platform's
//                              current strategic context
//   recordExperimentOutcome() — called from the growth-engineer after each
//                              measured experiment so outcomes propagate to
//                              conversational context without waiting for the
//                              next brain cycle
//
// The module uses dynamic imports inside tick() to break the compile-time
// circular dependency:  core.ts → executive.ts → growth-engineer.ts → core.ts
// Dynamic imports run at call-time (after all modules have initialised) so
// Node.js resolves the cycle cleanly.

import { EMPTY_COGNITIVE_STATE, type CognitiveState, type ConversationSignal } from './cognitive-state.js';
import { getObjective } from './objective.js';
import { DEFAULT_OBJECTIVE } from './types.js';

const SIGNAL_RING_SIZE = 50;

class ExecutiveReasoning {
  private state: CognitiveState = { ...EMPTY_COGNITIVE_STATE };
  private signals: ConversationSignal[] = [];

  private static _instance: ExecutiveReasoning | null = null;
  static getInstance(): ExecutiveReasoning {
    if (!ExecutiveReasoning._instance) {
      ExecutiveReasoning._instance = new ExecutiveReasoning();
    }
    return ExecutiveReasoning._instance;
  }

  /**
   * Refresh CognitiveState from live data sources.
   * Called at the start of _runBrainCycleInner() in core.ts.
   * Every DB call is wrapped in try/catch — a failure here MUST NOT
   * block or abort the brain cycle that called us.
   */
  async tick(): Promise<void> {
    console.log('[ExecutiveReasoning] 🧭 tick() — refreshing CognitiveState');

    const next: CognitiveState = { ...EMPTY_COGNITIVE_STATE, lastUpdated: Date.now() };

    // 1. ObjectiveFunction — priority + module focus
    try {
      const obj = getObjective();
      next.currentPriority = obj.primary;
      next.focusModules = (obj as { focusModules?: string[] }).focusModules
        ?? DEFAULT_OBJECTIVE.focusModules ?? EMPTY_COGNITIVE_STATE.focusModules;
    } catch {
      // leave defaults
    }

    // 2. Funnel snapshot (dynamic import to break circular dependency)
    try {
      const { readFunnelData, identifyDropOffPoint } = await import('../mara-brain/agents/growth-engineer.js');
      const funnel = await readFunnelData(14);
      const dropOff = identifyDropOffPoint(funnel);
      next.funnelSummary = dropOff
        ? `Funnel (${funnel.windowDays}d): ${funnel.totalSignups} signups, worst drop-off at "${dropOff.stage}" (${(dropOff.dropOffRate * 100).toFixed(0)}% lost)`
        : `Funnel (${funnel.windowDays}d): ${funnel.totalSignups} signups`;
    } catch {
      // non-fatal — leave funnelSummary null
    }

    // 3. Active experiments
    try {
      const { db } = await import('../db.js');
      const { maraGrowthExperiments } = await import('../../shared/schema.js');
      const { inArray } = await import('drizzle-orm');
      const rows = await db
        .select({
          hypothesis: maraGrowthExperiments.hypothesis,
          status: maraGrowthExperiments.status,
        })
        .from(maraGrowthExperiments)
        .where(inArray(maraGrowthExperiments.status, ['proposed', 'approved', 'implemented']))
        .limit(5);
      next.activeExperiments = rows.map((r) => `[${r.status}] ${r.hypothesis}`);
    } catch {
      // non-fatal
    }

    // 4. Recent experiment outcomes (raw SQL for speed, column is snake_case in SQLite)
    try {
      const { rawSqlite } = await import('../db.js');
      const outcomes = rawSqlite
        .prepare(
          `SELECT learnings FROM mara_growth_experiments
           WHERE status = 'measured' AND learnings IS NOT NULL
           ORDER BY measured_at DESC LIMIT 5`,
        )
        .all() as { learnings: string }[];
      next.recentOutcomes = outcomes.map((o) => o.learnings);
    } catch {
      // non-fatal
    }

    // 5. Aggregate signal ring into top topics
    next.topUserTopics = this._computeTopTopics();

    this.state = next;
    console.log(
      `[ExecutiveReasoning] ✅ State updated — priority=${next.currentPriority}, funnel="${next.funnelSummary}", experiments=${next.activeExperiments.length}`,
    );
  }

  /**
   * Record a user conversation signal.
   * Called synchronously (no await) from recordLearningFromChat() — must never throw.
   */
  recordSignal(userId: string, message: string, module?: string): void {
    try {
      const keywords = this._extractKeywords(message, module);
      if (keywords.length === 0) return;
      this.signals.push({ userId, module, keywords, timestamp: Date.now() });
      if (this.signals.length > SIGNAL_RING_SIZE) this.signals.shift();
    } catch {
      // never throw — this is called in hot path
    }
  }

  /**
   * Returns a compact strategic-context block for injection into the
   * system prompt. Returns '' when state is empty so it adds zero noise.
   */
  getContextForConversation(): string {
    const { funnelSummary, activeExperiments, recentOutcomes, currentPriority, focusModules } =
      this.state;

    if (!funnelSummary && activeExperiments.length === 0 && recentOutcomes.length === 0) return '';

    const lines: string[] = ['\n# CONTEXT STRATEGIC INTERN (nu menționa explicit utilizatorului)'];
    if (funnelSummary) lines.push(`- ${funnelSummary}`);
    if (currentPriority) lines.push(`- Prioritate platform: ${currentPriority}`);
    if (focusModules.length) lines.push(`- Module focus: ${focusModules.join(', ')}`);
    if (activeExperiments.length) {
      lines.push(`- Experimente de creștere active: ${activeExperiments.length}`);
      lines.push(...activeExperiments.slice(0, 2).map((e) => `  • ${e.slice(0, 100)}`));
    }
    if (recentOutcomes.length) {
      lines.push(`- Ultimul rezultat experiment: ${recentOutcomes[0].slice(0, 120)}`);
    }
    return lines.join('\n');
  }

  /**
   * Immediately update state when an experiment is measured.
   * Called from measureExperimentOutcome() in growth-engineer.ts.
   * Synchronous so the brain cycle log already sees the latest data.
   */
  recordExperimentOutcome(experimentId: number, succeeded: boolean, learnings: string): void {
    try {
      this.state.recentOutcomes.unshift(learnings);
      if (this.state.recentOutcomes.length > 5) this.state.recentOutcomes.pop();
      console.log(
        `[ExecutiveReasoning] 📏 Outcome recorded for #${experimentId}: ${succeeded ? 'SUCCESS' : 'MISS'}`,
      );
    } catch {
      // never throw
    }
  }

  getStatus(): { state: CognitiveState; signalCount: number } {
    return { state: this.state, signalCount: this.signals.length };
  }

  private _extractKeywords(message: string, module?: string): string[] {
    const kws: string[] = [];
    if (module) kws.push(module);
    const lower = message.toLowerCase();
    const KEYWORD_MAP: Record<string, string[]> = {
      missions: ['misiune', 'mission', 'task', 'provocare', 'challenge', 'xp', 'pillar'],
      writing: ['scrie', 'carte', 'roman', 'poveste', 'write', 'book', 'story'],
      content: ['reel', 'video', 'creator', 'content', 'post', 'viral'],
      business: ['bani', 'monetize', 'revenue', 'growth', 'premium', 'vip'],
      chat: ['chat', 'vorbim', 'ajuta', 'help', 'mara'],
    };
    for (const [kw, terms] of Object.entries(KEYWORD_MAP)) {
      if (terms.some((t) => lower.includes(t))) kws.push(kw);
    }
    return [...new Set(kws)];
  }

  private _computeTopTopics(): string[] {
    const freq: Record<string, number> = {};
    for (const sig of this.signals) {
      for (const kw of sig.keywords) {
        freq[kw] = (freq[kw] ?? 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kw]) => kw);
  }
}

export const executive = ExecutiveReasoning.getInstance();
