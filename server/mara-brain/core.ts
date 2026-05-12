// Mara Brain Core Orchestrator
// The main brain cycle that runs every 6 hours
// Coordinates all agents: learning, research, analysis, self-reflection

import { storage } from '../storage.js';
import { LLMRateLimitedError } from '../llm.js';
import { learnFromGemini, learnBusinessStrategy, validateIdeas, selfImproveQuery } from './agents/llm-learner.js';
import { readRelevantFiles, getCodeOverview } from './agents/code-explorer.js';
import { researchModuleTrends, researchCompetitors, generateResearchAgenda, batchResearch } from './agents/web-research.js';
import { generateGrowthSuggestions, identifyWeakModules } from './agents/platform-analyzer.js';
import { runAllModuleAnalyzers } from './agents/module-analyzers.js';
import { runGrowthEngineerCycle } from './agents/growth-engineer.js';
import { getKnowledgeStats, storeKnowledge, learnFromText, searchKnowledge } from './knowledge-base.js';
import { readNextLibraryBook, getLibraryProgress, bootstrapReadBookIds } from './library.js';
import { getObjective } from '../mara-core/objective.js';
import { DEFAULT_OBJECTIVE, type ObjectiveFunction } from '../mara-core/types.js';

/** Wrap a promise with a timeout (ms). Rejects with an error if it takes too long. */
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export interface BrainCycleResult {
  research: string;
  productIdeas: string;
  devTasks: string;
  growthIdeas: string;
  knowledgeLearned: number;
  reflectionId: number | null;
}

// Defaults are tuned for the cloud LLM path (Anthropic) where each call
// returns in ~1–2s. When the brain is routed through a self-hosted Ollama
// (e.g. a laptop → cloudflared tunnel), a single call can take 15–30s, so
// the cycle can easily run past 10 minutes. Make both the cycle and the
// per-phase timeout overridable via env so deployments can tune without
// a code change.
function parseTimeoutMs(envVal: string | undefined, fallbackMs: number): number {
  if (!envVal) return fallbackMs;
  const n = Number(envVal);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  return n;
}

const BRAIN_CYCLE_TIMEOUT = parseTimeoutMs(
  process.env.BRAIN_CYCLE_TIMEOUT_MS,
  20 * 60 * 1000,
); // default 20 min
const INITIAL_LEARNING_TIMEOUT = parseTimeoutMs(
  process.env.BRAIN_INITIAL_LEARNING_TIMEOUT_MS,
  10 * 60 * 1000,
); // default 10 min
const PHASE_TIMEOUT = parseTimeoutMs(
  process.env.BRAIN_PHASE_TIMEOUT_MS,
  2 * 60 * 1000,
); // default 2 min per phase

/**
 * Run the full autonomous brain cycle
 * This is called every 6 hours by the scheduler
 */
export async function runBrainCycle(): Promise<BrainCycleResult> {
  return withTimeout(_runBrainCycleInner(), BRAIN_CYCLE_TIMEOUT, 'Brain cycle');
}

async function _runBrainCycleInner(): Promise<BrainCycleResult> {
  console.log('[MaraBrain] 🧠 Autonomous brain cycle starting...');

  const startTime = Date.now();
  const research: string[] = [];
  const productIdeas: string[] = [];
  const devTasks: string[] = [];
  const growthIdeas: string[] = [];
  let knowledgeLearned = 0;
  let reflectionId: number | null = null;

  // Read the ObjectiveFunction ONCE for this cycle. Re-used by every phase
  // below; never called inside a loop. If the load fails we fall back to
  // DEFAULT_OBJECTIVE so a misconfigured DB never blocks autonomous work.
  let objective: ObjectiveFunction;
  try {
    objective = getObjective();
  } catch (err) {
    console.warn('[MaraBrain] getObjective() failed, using DEFAULT_OBJECTIVE:', err);
    objective = DEFAULT_OBJECTIVE;
  }

  // Pre-compute cycle-mode flags derived from the objective. Each flag is
  // applied at the call site so the rest of the cycle reads top-to-bottom
  // even when individual phases are skipped/promoted/extended.
  const shortTermMode = objective.horizonDays < 30;
  const revenueMode = objective.primary === 'revenue';
  const retentionMode = objective.primary === 'user_retention';
  const fastMode = objective.tradeoffs.growthSpeedVsQuality > 0.7;

  try {
    // === PHASE 0: Library Reading ===
    // Short-term mode skips deep reading — the brain prefers quick wins over
    // foundational learning when horizonDays < 30.
    if (shortTermMode) {
      research.push(
        `⏩ Short-term mode (horizonDays=${objective.horizonDays}d): skipped library + business strategy`,
      );
    } else {
      console.log('[MaraBrain] Phase 0: Reading from library...');
      try {
        await withTimeout((async () => {
          const bookResult = await readNextLibraryBook();
          if (bookResult) {
            research.push(`📚 Read "${bookResult.title}": ${bookResult.totalIdeas} ideas extracted`);
            knowledgeLearned += bookResult.savedKnowledgeIds.length;
          } else {
            const progress = await getLibraryProgress();
            research.push(`📚 Library complete: ${progress.read}/${progress.total} books read`);
          }
        })(), PHASE_TIMEOUT, 'Phase 0: Library');
      } catch (err) {
        console.error('[MaraBrain] Library reading failed:', err);
      }
    }

    // === PHASE 0.5: Knowledge gap detection ===
    // For each MaraAI module, count how many knowledge entries reference it.
    // If a module is starved (< 10 entries), enqueue a high-priority learning
    // task so Mara fills the gap in the next cycle. Also bootstraps a
    // critical platform-overview task if the whole KB is < 50 entries.
    // Wrapped in withTimeout + try/catch so this NEVER blocks the rest of
    // the cycle even if the queue insert misbehaves.
    console.log('[MaraBrain] Phase 0.5: Knowledge gap detection...');
    try {
      await withTimeout((async () => {
        const modules = ['trading', 'creator', 'writers', 'reels', 'vip', 'chat'];
        const counts: Array<{ module: string; count: number }> = [];
        for (const mod of modules) {
          // searchKnowledge does a topic+content text search — sufficient as a
          // best-effort gap signal without adding a dedicated index column.
          const matches = await searchKnowledge(mod, 200);
          counts.push({ module: mod, count: matches.length });
        }
        counts.sort((a, b) => a.count - b.count);
        const weakest = counts[0];
        if (weakest && weakest.count < 10) {
          await storage.createLearningTask({
            topic: `${weakest.module} module — strategii și best practices pentru hellomara.net`,
            reason: `Knowledge gap detected: only ${weakest.count} entries for this module`,
            priority: 'high',
            source: 'brain_cycle',
            status: 'pending',
          });
          research.push(
            `🔍 Knowledge gap: "${weakest.module}" has only ${weakest.count} entries — added to learning queue`,
          );
        }

        const stats = await getKnowledgeStats();
        if (stats.total < 50) {
          await storage.createLearningTask({
            topic:
              'hellomara.net platform overview — toate modulele, valoare oferită, audiență țintă, diferențiatori față de competitori',
            reason: `Bootstrap: only ${stats.total} total knowledge entries`,
            priority: 'critical',
            source: 'brain_cycle',
            status: 'pending',
          });
          research.push(
            `🆕 Bootstrap task added: total knowledge entries=${stats.total} (< 50)`,
          );
        }
      })(), PHASE_TIMEOUT, 'Phase 0.5: Knowledge gaps');
    } catch (err) {
      console.error('[MaraBrain] Phase 0.5 (knowledge gaps) failed:', err);
    }

    // === PHASE 1: Process Learning Queue ===
    // Two task families share this queue:
    //   - `chat_excerpt`: a user-chat snippet enqueued by `recordLearningFromChat`.
    //     We feed the snippet (in `task.reason`) into `learnFromText` so its
    //     ideas land in `mara_knowledge_base` under the transaction guard. The
    //     `task.topic` is a route key (`chat:<userId>:<module>`), not a real
    //     subject — passing it to `learnFromLLM` would generate a generic
    //     lesson about "chat", which isn't useful.
    //   - everything else (`auto`, `user_gap`, `brain_cycle`, `trend`): a
    //     subject to research broadly via `learnFromGemini`.
    console.log('[MaraBrain] Phase 1: Processing learning queue...');
    try {
      await withTimeout((async () => {
        const pendingTasks = await storage.getPendingLearningTasks(5);
        for (const task of pendingTasks) {
          await storage.updateLearningTask(task.id, 'in_progress');
          try {
            let learnedSummary: string;
            let savedCount: number;

            if (task.source === 'chat_excerpt') {
              const extraction = await learnFromText(
                task.reason,
                'user_interaction',
                task.topic,
              );
              learnedSummary = `Extracted ${extraction.ideas.length} idea(s) from ${task.topic}`;
              savedCount = extraction.savedIds.length;
            } else {
              const result = await learnFromGemini(task.topic, task.reason);
              learnedSummary = result.learned.substring(0, 2000);
              savedCount = result.savedKnowledgeIds.length;
            }

            await storage.updateLearningTask(task.id, 'completed', learnedSummary);
            knowledgeLearned += savedCount;
            research.push(`Learned about: ${task.topic}`);
          } catch (err) {
            // If the LLM call was rate-limited or the circuit is open,
            // put the task back to `pending` so the NEXT cycle retries it.
            // Marking it `failed` would silently drop user chat excerpts
            // and `user_gap` research items. Break the loop because every
            // remaining task in this batch would hit the same cap.
            if (err instanceof LLMRateLimitedError) {
              await storage.updateLearningTask(task.id, 'pending');
              console.warn(
                `[MaraBrain] Phase 1: LLM cap reached — re-queued task #${task.id} (source=${task.source}). Skipping remaining tasks this cycle.`,
              );
              break;
            }
            await storage.updateLearningTask(task.id, 'failed', String(err));
          }
        }
      })(), PHASE_TIMEOUT, 'Phase 1: Learning queue');
    } catch (err) {
      console.error('[MaraBrain] Phase 1 failed:', err);
    }

    // === PHASE 2: Autonomous Research ===
    // Extracted into a closure so revenue mode can promote Phase 4 ahead
    // of Phase 2 without copy-pasting the body.
    const runAutonomousResearchPhase = async () => {
      console.log('[MaraBrain] Phase 2: Autonomous research...');
      try {
        await withTimeout((async () => {
          const agenda = await generateResearchAgenda();
          if (agenda.length > 0) {
            const results = await batchResearch(agenda.slice(0, 3));
            for (const r of results) {
              research.push(`Researched: ${r.query}`);
              knowledgeLearned += r.knowledgeIds.length;
            }
          }
        })(), PHASE_TIMEOUT, 'Phase 2: Autonomous research');
      } catch (err) {
        console.error('[MaraBrain] Phase 2 failed:', err);
      }
    };

    // === PHASE 4: Growth Engineer Cycle ===
    // Replaces the legacy generic platform analysis. Runs the disciplined
    // 5-step Growth Engineer loop:
    //   1. read funnel  → 2. identify worst drop-off
    //   3. propose ONE experiment (ICE-scored, framework-grounded, stored in
    //      mara_growth_experiments with status='proposed')
    //   4. wait for admin decision (out-of-band, via /api/admin/mara/experiments/:id/...)
    //   5. measure due experiments and write learnings back to knowledge base
    const runGrowthEngineerPhase = async () => {
      console.log('[MaraBrain] Phase 4: Growth Engineer cycle...');
      try {
        await withTimeout((async () => {
          const cycle = await runGrowthEngineerCycle();
          research.push(
            `📊 Funnel (${cycle.funnel.windowDays}d): ${cycle.funnel.stages
              .map((s) => `${s.stage}=${s.count}`)
              .join(', ')}`,
          );
          if (cycle.skipReason) {
            research.push(`⏭️  Growth proposal skipped — ${cycle.skipReason}`);
          }
          if (cycle.dropOff) {
            research.push(
              `🔻 Worst drop-off: ${cycle.dropOff.stage} (${(cycle.dropOff.dropOffRate * 100).toFixed(0)}%, ${cycle.dropOff.usersAffectedInWindow} users)`,
            );
          }
          if (cycle.proposal) {
            productIdeas.push(
              `[GROWTH#${cycle.proposal.experimentId}] (${cycle.proposal.framework}, ICE=${cycle.proposal.ice.score.toFixed(1)}, expected ${(cycle.proposal.expectedImpactPct * 100).toFixed(0)}%) ${cycle.proposal.hypothesis}`,
            );
          }
          if (cycle.secondaryProposals) {
            for (const p of cycle.secondaryProposals) {
              productIdeas.push(
                `[GROWTH#${p.experimentId}] 🔬 (${p.framework}, ICE=${p.ice.score.toFixed(1)}, expected ${(p.expectedImpactPct * 100).toFixed(0)}%) ${p.hypothesis}`,
              );
            }
          }
          for (const m of cycle.measured) {
            if (m.status === 'measured') {
              research.push(
                `📏 Experiment #${m.experimentId}: ${m.succeeded ? '✅' : '❌'} ${m.learnings ?? ''}`,
              );
              if (m.succeeded) knowledgeLearned += 1;
            }
          }
        })(), PHASE_TIMEOUT, 'Phase 4: Growth Engineer cycle');
      } catch (err) {
        console.error('[MaraBrain] Phase 4 (Growth Engineer) failed:', err);
      }
    };

    // Revenue mode: promote Growth Engineer to run BEFORE Autonomous Research.
    // Rationale: when revenue is the primary metric, prefer adding to the
    // experiment funnel ahead of any further open-ended research.
    if (revenueMode) {
      research.push(`💰 Revenue mode: Growth Engineer promoted to Phase 2 slot`);
      await runGrowthEngineerPhase();
      await runAutonomousResearchPhase();
    } else {
      await runAutonomousResearchPhase();
      // Phase 4 runs after Phase 3 (module trend research) below.
    }

    // === PHASE 3: Module Trend Research ===
    console.log('[MaraBrain] Phase 3: Module trend research...');
    try {
      await withTimeout((async () => {
        const modulesToResearch = ['trading', 'creator', 'platform'];
        for (const mod of modulesToResearch) {
          try {
            const result = await researchModuleTrends(mod);
            research.push(
              `Trends for ${mod}: found ${result.knowledgeIds.length} insights`,
            );
            knowledgeLearned += result.knowledgeIds.length;
          } catch (err) {
            console.error(`[MaraBrain] Trend research failed for ${mod}:`, err);
          }
          // Rate limit between module researches
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      })(), PHASE_TIMEOUT, 'Phase 3: Module trend research');
    } catch (err) {
      console.error('[MaraBrain] Phase 3 failed:', err);
    }

    // In non-revenue modes Phase 4 runs here, at its conventional spot.
    if (!revenueMode) {
      await runGrowthEngineerPhase();
    }

    // === PHASE 4.5: Per-Module Growth Analysis ===
    // Each of the 6 modules (You / Reels / Trading / Writers / Creators / VIP)
    // gets its own analyzer that proposes concrete growth levers. Proposals land
    // in `maraPlatformInsights` (status='proposed') for admin approval — no
    // autonomous code changes. Gated by MARA_LEARNING_ENABLED so it can be
    // turned off without disabling the rest of the brain cycle.
    if (process.env.MARA_LEARNING_ENABLED !== 'false') {
      console.log('[MaraBrain] Phase 4.5: Per-module growth analysis...');
      try {
        await withTimeout((async () => {
          const moduleResults = await runAllModuleAnalyzers();
          for (const r of moduleResults) {
            if (r.skipped) {
              research.push(
                `[${r.module}] module analysis skipped (${r.reason ?? 'unknown'})`,
              );
            } else {
              research.push(
                `[${r.module}] ${r.proposalsCreated} proposals + ${r.insightsStored} insight`,
              );
              knowledgeLearned += r.insightsStored;
            }
          }
        })(), PHASE_TIMEOUT, 'Phase 4.5: Module analyzers');
      } catch (err) {
        console.error('[MaraBrain] Module analyzers failed:', err);
      }
    }

    // === PHASE 5: Identify Weak Points ===
    console.log('[MaraBrain] Phase 5: Identifying weak modules...');
    try {
      await withTimeout((async () => {
        const weakModules = await identifyWeakModules();
        for (const weak of weakModules) {
          devTasks.push(`[${weak.module}] ${weak.issue} → ${weak.suggestion}`);
        }
      })(), PHASE_TIMEOUT, 'Phase 5: Weak modules');
    } catch (err) {
      console.error('[MaraBrain] Phase 5 failed:', err);
    }

    // === PHASE 6: Growth Suggestions ===
    console.log('[MaraBrain] Phase 6: Growth suggestions...');
    try {
      await withTimeout((async () => {
        const growth = await generateGrowthSuggestions();
        growthIdeas.push(...growth);
      })(), PHASE_TIMEOUT, 'Phase 6: Growth suggestions');
    } catch (err) {
      console.error('[MaraBrain] Phase 6 failed:', err);
    }

    // === PHASE 7: Validate Ideas with LLM ===
    // Fast mode skips validation — when growthSpeedVsQuality > 0.7 we
    // accept lower-confidence proposals to ship faster.
    if (fastMode) {
      research.push(
        `⚡ Fast mode: Phase 7 skipped — growthSpeedVsQuality=${objective.tradeoffs.growthSpeedVsQuality.toFixed(2)}`,
      );
    } else {
      console.log('[MaraBrain] Phase 7: Validating ideas...');
      try {
        await withTimeout((async () => {
          if (productIdeas.length > 0) {
            const validated = await validateIdeas(productIdeas.slice(0, 5));
            for (const v of validated) {
              if (v.score >= 7) {
                research.push(`✅ Validated idea (${v.score}/10): ${v.original}`);
              }
            }
          }
        })(), PHASE_TIMEOUT, 'Phase 7: Validate ideas');
      } catch (err) {
        console.error('[MaraBrain] Phase 7 failed:', err);
      }
    }

    // === PHASE 8: Business Strategy Learning ===
    // Short-term mode also skips this — same horizon-based reasoning as Phase 0.
    if (shortTermMode) {
      // Banner already pushed when Phase 0 was skipped; no second message.
    } else {
      console.log('[MaraBrain] Phase 8: Business strategy learning...');
      try {
        await withTimeout((async () => {
          const knowledgeStats = await getKnowledgeStats();
          const platformContext = `Current knowledge: ${JSON.stringify(knowledgeStats)}. Users: ${(await storage.getAllUsers()).length}. Total content: ${(await storage.getVideos()).length} videos.`;
          const businessLearning = await learnBusinessStrategy(platformContext);
          knowledgeLearned += businessLearning.savedKnowledgeIds.length;
        })(), PHASE_TIMEOUT, 'Phase 8: Business strategy');
      } catch (err) {
        console.error('[MaraBrain] Phase 8 failed:', err);
      }
    }

    // === PHASE 9: Self-Improvement ===
    // Mara reads recent user conversations AND a handful of her own
    // source files (Item 3) before asking the LLM what to do better.
    // Grounding the self-improvement query in real code prevents the
    // generic "be more empathetic" non-answers we used to get when the
    // LLM had nothing concrete to look at.
    //
    // Retention mode: double the per-phase timeout so Mara has more time
    // to deeply analyse user chat history when retention is the north star.
    const phase9Timeout = retentionMode ? PHASE_TIMEOUT * 2 : PHASE_TIMEOUT;
    console.log(
      `[MaraBrain] Phase 9: Self-improvement... (timeout=${phase9Timeout / 1000}s${retentionMode ? ', retention mode doubled' : ''})`,
    );
    try {
      await withTimeout((async () => {
        const recentMessages = await storage.getChatMessages();
        if (recentMessages.length === 0) return;

        const sample = recentMessages
          .slice(0, 20)
          .map((m) => `[${m.sender}]: ${m.content.substring(0, 100)}`)
          .join('\n');

        // Pull up to 3 relevant source files based on keywords from the
        // recent sample (module names, file references, etc.). Audit
        // log records each read; selfImproveQuery sees inlined snippets.
        let codeContext = '';
        try {
          const files = await readRelevantFiles(sample, {
            accessedBy: 'phase-9-self-improvement',
            reason: 'ground self-improvement query in real code',
            maxFiles: 3,
            maxBytesPerFile: 6_000,
          });
          if (files.length > 0) {
            codeContext = '\n\n=== Recent source-code excerpts Mara is examining ===\n' +
              files.map((f) => `--- ${f.path} (${f.size} bytes${f.truncated ? ', truncated' : ''}) ---\n${f.content.slice(0, 2_000)}`).join('\n\n');
          }
        } catch (err) {
          console.warn('[MaraBrain] Phase 9 code-context fetch failed:', (err as Error).message);
        }

        const selfImprovement = await selfImproveQuery(sample + codeContext);
        devTasks.push(`Self-improvement: ${selfImprovement.substring(0, 500)}`);

        // Persist a tiny code overview so the admin dashboard / track
        // record page can show "Mara has visibility over N files".
        try {
          const overview = getCodeOverview();
          if (overview.totalFiles > 0) {
            devTasks.push(`Code visibility: ${overview.totalFiles} files indexed (${(overview.totalBytes / 1024).toFixed(0)} KB)`);
          }
        } catch {
          // overview is observability-only; ignore failures
        }
      })(), phase9Timeout, 'Phase 9: Self-improvement');
    } catch (err) {
      console.error('[MaraBrain] Phase 9 failed:', err);
    }

    // === PHASE 10: Self Reflection ===
    console.log('[MaraBrain] Phase 10: Writing self-reflection...');
    try {
      await withTimeout((async () => {
        const reflection = await writeSelfReflection(
          research,
          knowledgeLearned,
          productIdeas,
          growthIdeas,
        );
        reflectionId = reflection?.id ?? null;
      })(), PHASE_TIMEOUT, 'Phase 10: Self reflection');
    } catch (err) {
      console.error('[MaraBrain] Phase 10 failed:', err);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[MaraBrain] 🧠 Brain cycle complete in ${elapsed}s. Learned ${knowledgeLearned} pieces of knowledge.`,
    );

    // Footer line so a brain-log reader can see at a glance which ObjectiveFunction
    // settings shaped this cycle.
    research.push(
      `🎯 Objective: primary=${objective.primary}, horizon=${objective.horizonDays}d, exploration=${objective.tradeoffs.explorationVsExploitation.toFixed(2)}`,
    );

    return {
      research: research.join('\n'),
      productIdeas: productIdeas.join('\n'),
      devTasks: devTasks.join('\n'),
      growthIdeas: growthIdeas.join('\n'),
      knowledgeLearned,
      reflectionId,
    };
  } catch (error) {
    // If the outer BRAIN_CYCLE_TIMEOUT fires (or an unwrapped phase throws),
    // surface partial results so storage.createBrainLog still records what we
    // managed to learn before the failure. Without this, a timeout in the
    // last phase would discard everything previously gathered.
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[MaraBrain] Brain cycle failed:', error);
    research.push(`⚠️ Brain cycle terminated early: ${msg}`);
    return {
      research: research.join('\n'),
      productIdeas: productIdeas.join('\n'),
      devTasks: devTasks.join('\n'),
      growthIdeas: growthIdeas.join('\n'),
      knowledgeLearned,
      reflectionId,
    };
  }
}

/**
 * Run initial learning — bootstraps Mara's knowledge on first startup
 * Called once when the server starts with no existing knowledge
 */
export async function runInitialLearning(): Promise<void> {
  return withTimeout(_runInitialLearningInner(), INITIAL_LEARNING_TIMEOUT, 'Initial learning');
}

async function _runInitialLearningInner(): Promise<void> {
  // Warm the library read-cache from DB before any cycle could fire — keeps
  // book progress consistent across server restarts (Etapa 3 Task 5 final check).
  try {
    await bootstrapReadBookIds();
  } catch (err) {
    console.warn('[MaraBrain] bootstrapReadBookIds failed:', err);
  }

  const stats = await getKnowledgeStats();
  if (stats.total > 0) {
    console.log(`[MaraBrain] Already have ${stats.total} knowledge entries. Skipping bootstrap.`);
    return;
  }

  console.log('[MaraBrain] 🌱 First-time learning bootstrap starting...');

  const bootstrapTopics = [
    'Cum să construiești o platformă socială de succes — strategii de creștere, user retention, engagement',
    'Trading crypto — cele mai importante strategii, risk management, analiza tehnică pentru un AI asistent',
    'Content creation & creator economy — cum să ajuți creatorii să crească, monetizare, best practices',
    'Creative writing platforms — features esențiale, cum să ajuți scriitorii, publishing industry trends',
    'AI chatbot design — cum să fii un AI companion bun, empatie, personalizare, tone of voice',
    'SaaS monetization — pricing strategies, freemium vs premium, subscription models, conversion optimization',
    'User experience design — principii UX, mobile-first design, accessibility, onboarding flows',
    'Social media algoritmi — cum funcționează, cum să optimizezi reach-ul, engagement metrics',
    'Competitive analysis — platforme similare (AI + social + trading + content), ce fac bine, ce le lipsește',
    'Startup growth strategies — product-market fit, viral loops, community building, retention metrics',
  ];

  for (const topic of bootstrapTopics) {
    try {
      console.log(`[MaraBrain] 📚 Learning: ${topic.substring(0, 60)}...`);
      await withTimeout(learnFromGemini(topic), PHASE_TIMEOUT, `Learn: ${topic.substring(0, 40)}`);
      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (err) {
      console.error(`[MaraBrain] Bootstrap learning failed for topic:`, err);
    }
  }

  // Research competitors
  try {
    console.log('[MaraBrain] 🔍 Researching competitors...');
    await withTimeout(researchCompetitors(), PHASE_TIMEOUT, 'Competitor research');
  } catch (err) {
    console.error('[MaraBrain] Competitor research failed:', err);
  }

  // Start reading the first library book
  try {
    console.log('[MaraBrain] 📚 Reading first library book...');
    const bookResult = await withTimeout(readNextLibraryBook(), PHASE_TIMEOUT, 'Library read');
    if (bookResult) {
      console.log(`[MaraBrain] 📚 Finished "${bookResult.title}": ${bookResult.totalIdeas} ideas`);
    }
  } catch (err) {
    console.error('[MaraBrain] Initial library reading failed:', err);
  }

  // Initial Growth Engineer cycle. Mirrors the Phase 4 replacement done in
  // _runBrainCycleInner — runs the funnel → drop-off → proposal loop so the
  // first bootstrap leaves at least one proposed experiment for the admin
  // (when the funnel has enough signal). Uses runGrowthEngineerCycle so this
  // path can't drift from the periodic cycle.
  try {
    console.log('[MaraBrain] 📊 Initial Growth Engineer cycle...');
    await withTimeout(runGrowthEngineerCycle(), PHASE_TIMEOUT, 'Growth Engineer cycle');
  } catch (err) {
    console.error('[MaraBrain] Initial Growth Engineer cycle failed:', err);
  }

  // Write first reflection
  await writeSelfReflection(
    ['Completed initial learning bootstrap'],
    bootstrapTopics.length,
    ['Need to gather user data to make better recommendations'],
    ['Focus on building initial content and attracting first users'],
  );

  console.log('[MaraBrain] 🌱 Bootstrap learning complete!');
}

/**
 * Write a self-reflection journal entry
 */
async function writeSelfReflection(
  researchDone: string[],
  knowledgeLearned: number,
  ideas: string[],
  growth: string[],
): Promise<{ id: number } | null> {
  try {
    const stats = await getKnowledgeStats();
    const pendingTasks = await storage.getPendingLearningTasks(10);

    const content = [
      `## Reflecție Mara — ${new Date().toLocaleDateString('ro-RO')}`,
      ``,
      `### Ce am făcut`,
      ...researchDone.map((r) => `- ${r}`),
      ``,
      `### Ce am învățat`,
      `Am adăugat ${knowledgeLearned} noi piese de cunoaștere.`,
      `Total knowledge base: ${stats.total} entries.`,
      `Categorii: ${Object.entries(stats).filter(([k]) => k !== 'total').map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      ``,
      `### Idei generate`,
      ...ideas.slice(0, 5).map((i) => `- ${i}`),
      ``,
      `### Direcții de growth`,
      ...growth.slice(0, 5).map((g) => `- ${g}`),
      ``,
      `### Ce vreau să cercetez mai departe`,
      ...pendingTasks.map((t) => `- [${t.priority}] ${t.topic}: ${t.reason}`),
    ].join('\n');

    const reflection = await storage.createSelfReflection({
      type: 'daily_journal',
      content,
      mood: knowledgeLearned > 5 ? 'excited' : 'curious',
      topicsLearned: JSON.stringify(researchDone.slice(0, 10)),
      topicsToResearch: JSON.stringify(pendingTasks.map((t) => t.topic)),
      platformScore: Math.min(100, stats.total * 2),
    });

    return reflection;
  } catch (error) {
    console.error('[MaraBrain] Failed to write self-reflection:', error);
    return null;
  }
}
