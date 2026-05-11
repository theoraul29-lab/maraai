// Mara Brain Core Orchestrator
// The main brain cycle that runs every 6 hours
// Coordinates all agents: learning, research, analysis, self-reflection

import { storage } from '../storage.js';
import { learnFromGemini, learnBusinessStrategy, validateIdeas, selfImproveQuery } from './agents/llm-learner.js';
import { researchModuleTrends, researchCompetitors, generateResearchAgenda, batchResearch } from './agents/web-research.js';
import { analyzePlatform, generateGrowthSuggestions, identifyWeakModules } from './agents/platform-analyzer.js';
import { runAllModuleAnalyzers } from './agents/module-analyzers.js';
import { getKnowledgeStats, storeKnowledge } from './knowledge-base.js';
import { readNextLibraryBook, getLibraryProgress } from './library.js';

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

  try {
    // === PHASE 0: Library Reading ===
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

    // === PHASE 1: Process Learning Queue ===
    console.log('[MaraBrain] Phase 1: Processing learning queue...');
    try {
      await withTimeout((async () => {
        const pendingTasks = await storage.getPendingLearningTasks(5);
        for (const task of pendingTasks) {
          try {
            await storage.updateLearningTask(task.id, 'in_progress');
            const result = await learnFromGemini(task.topic, task.reason);
            await storage.updateLearningTask(
              task.id,
              'completed',
              result.learned.substring(0, 2000),
            );
            knowledgeLearned += result.savedKnowledgeIds.length;
            research.push(`Learned about: ${task.topic}`);
          } catch (err) {
            await storage.updateLearningTask(task.id, 'failed', String(err));
          }
        }
      })(), PHASE_TIMEOUT, 'Phase 1: Learning queue');
    } catch (err) {
      console.error('[MaraBrain] Phase 1 failed:', err);
    }

    // === PHASE 2: Autonomous Research ===
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

    // === PHASE 4: Platform Analysis ===
    console.log('[MaraBrain] Phase 4: Platform analysis...');
    try {
      await withTimeout((async () => {
        const analysis = await analyzePlatform();
        productIdeas.push(
          ...(analysis.proposals?.map(
            (p) => `[${p.priority}] ${p.title}: ${p.description}`,
          ) || []),
        );
        research.push(...(analysis.insights || []));
      })(), PHASE_TIMEOUT, 'Phase 4: Platform analysis');
    } catch (err) {
      console.error('[MaraBrain] Phase 4 failed:', err);
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

    // === PHASE 8: Business Strategy Learning ===
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

    // === PHASE 9: Self-Improvement ===
    console.log('[MaraBrain] Phase 9: Self-improvement...');
    try {
      await withTimeout((async () => {
        const recentMessages = await storage.getChatMessages();
        if (recentMessages.length > 0) {
          const sample = recentMessages
            .slice(0, 20)
            .map((m) => `[${m.sender}]: ${m.content.substring(0, 100)}`)
            .join('\n');
          const selfImprovement = await selfImproveQuery(sample);
          devTasks.push(`Self-improvement: ${selfImprovement.substring(0, 500)}`);
        }
      })(), PHASE_TIMEOUT, 'Phase 9: Self-improvement');
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

  // Initial platform analysis
  try {
    console.log('[MaraBrain] 📊 Initial platform analysis...');
    await withTimeout(analyzePlatform(), PHASE_TIMEOUT, 'Platform analysis');
  } catch (err) {
    console.error('[MaraBrain] Initial analysis failed:', err);
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
