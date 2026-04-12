// Mara Brain Core Orchestrator
// The main brain cycle that runs every 6 hours
// Coordinates all agents: learning, research, analysis, self-reflection

import { storage } from '../storage.js';
import { learnFromGemini, learnBusinessStrategy, validateIdeas, selfImproveQuery } from './agents/gemini-learner.js';
import { researchModuleTrends, researchCompetitors, generateResearchAgenda, batchResearch } from './agents/web-research.js';
import { analyzePlatform, generateGrowthSuggestions, identifyWeakModules } from './agents/platform-analyzer.js';
import { getKnowledgeStats, storeKnowledge } from './knowledge-base.js';
import { readNextLibraryBook, getLibraryProgress } from './library.js';

export interface BrainCycleResult {
  research: string;
  productIdeas: string;
  devTasks: string;
  growthIdeas: string;
  knowledgeLearned: number;
  reflectionId: number | null;
}

const BRAIN_CYCLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_LEARNING_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Run the full autonomous brain cycle
 * This is called every 6 hours by the scheduler.
 * Wrapped in a 5-minute timeout so a hung AI call can never block the process.
 */
export async function runBrainCycle(): Promise<BrainCycleResult> {
  console.log('[MaraBrain] 🧠 Autonomous brain cycle starting...');

  const timeoutPromise = new Promise<BrainCycleResult>((resolve) => {
    setTimeout(() => {
      console.warn('[MaraBrain] ⏱️ Brain cycle exceeded 5-minute timeout — returning partial results.');
      resolve({
        research: 'Brain cycle timed out after 5 minutes.',
        productIdeas: '',
        devTasks: '',
        growthIdeas: '',
        knowledgeLearned: 0,
        reflectionId: null,
      });
    }, BRAIN_CYCLE_TIMEOUT_MS);
  });

  return Promise.race([_runBrainCycleInternal(), timeoutPromise]);
}

async function _runBrainCycleInternal(): Promise<BrainCycleResult> {

  const startTime = Date.now();
  const research: string[] = [];
  const productIdeas: string[] = [];
  const devTasks: string[] = [];
  const growthIdeas: string[] = [];
  let knowledgeLearned = 0;

  try {
    // === PHASE 0: Library Reading ===
    console.log('[MaraBrain] Phase 0: Reading from library...');
    try {
      const bookResult = await readNextLibraryBook();
      if (bookResult) {
        research.push(`📚 Read "${bookResult.title}": ${bookResult.totalIdeas} ideas extracted`);
        knowledgeLearned += bookResult.savedKnowledgeIds.length;
      } else {
        const progress = await getLibraryProgress();
        research.push(`📚 Library complete: ${progress.read}/${progress.total} books read`);
      }
    } catch (err) {
      console.error('[MaraBrain] Library reading failed:', err);
    }

    // === PHASE 1: Process Learning Queue ===
    console.log('[MaraBrain] Phase 1: Processing learning queue...');
    const pendingTasks = await storage.getPendingLearningTasks(5);
    for (const task of pendingTasks) {
      try {
        await storage.updateLearningTask(task.id, 'in_progress');
        const result = await learnFromGemini(task.topic, task.reason);
        await storage.updateLearningTask(task.id, 'completed', result.learned.substring(0, 2000));
        knowledgeLearned += result.savedKnowledgeIds.length;
        research.push(`Learned about: ${task.topic}`);
      } catch (err) {
        await storage.updateLearningTask(task.id, 'failed', String(err));
      }
    }

    // === PHASE 2: Autonomous Research ===
    console.log('[MaraBrain] Phase 2: Autonomous research...');
    const agenda = await generateResearchAgenda();
    if (agenda.length > 0) {
      const results = await batchResearch(agenda.slice(0, 3));
      for (const r of results) {
        research.push(`Researched: ${r.query}`);
        knowledgeLearned += r.knowledgeIds.length;
      }
    }

    // === PHASE 3: Module Trend Research ===
    console.log('[MaraBrain] Phase 3: Module trend research...');
    const modulesToResearch = ['trading', 'creator', 'platform'];
    for (const mod of modulesToResearch) {
      try {
        const result = await researchModuleTrends(mod);
        research.push(`Trends for ${mod}: found ${result.knowledgeIds.length} insights`);
        knowledgeLearned += result.knowledgeIds.length;
      } catch (err) {
        console.error(`[MaraBrain] Trend research failed for ${mod}:`, err);
      }
      // Rate limit between module researches
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // === PHASE 4: Platform Analysis ===
    console.log('[MaraBrain] Phase 4: Platform analysis...');
    try {
      const analysis = await analyzePlatform();
      productIdeas.push(...(analysis.proposals?.map((p) => `[${p.priority}] ${p.title}: ${p.description}`) || []));
      research.push(...(analysis.insights || []));
    } catch (err) {
      console.error('[MaraBrain] Phase 4 (platform analysis) failed — skipping:', err);
    }

    // === PHASE 5: Identify Weak Points ===
    console.log('[MaraBrain] Phase 5: Identifying weak modules...');
    const weakModules = await identifyWeakModules();
    for (const weak of weakModules) {
      devTasks.push(`[${weak.module}] ${weak.issue} → ${weak.suggestion}`);
    }

    // === PHASE 6: Growth Suggestions ===
    console.log('[MaraBrain] Phase 6: Growth suggestions...');
    const growth = await generateGrowthSuggestions();
    growthIdeas.push(...growth);

    // === PHASE 7: Validate Ideas with Gemini ===
    console.log('[MaraBrain] Phase 7: Validating ideas...');
    if (productIdeas.length > 0) {
      const validated = await validateIdeas(productIdeas.slice(0, 5));
      for (const v of validated) {
        if (v.score >= 7) {
          research.push(`✅ Validated idea (${v.score}/10): ${v.original}`);
        }
      }
    }

    // === PHASE 8: Business Strategy Learning ===
    console.log('[MaraBrain] Phase 8: Business strategy learning...');
    const knowledgeStats = await getKnowledgeStats();
    const platformContext = `Current knowledge: ${JSON.stringify(knowledgeStats)}. Users: ${(await storage.getAllUsers()).length}. Total content: ${(await storage.getVideos()).length} videos.`;
    const businessLearning = await learnBusinessStrategy(platformContext);
    knowledgeLearned += businessLearning.savedKnowledgeIds.length;

    // === PHASE 9: Self-Improvement ===
    console.log('[MaraBrain] Phase 9: Self-improvement...');
    const recentMessages = await storage.getChatMessages();
    if (recentMessages.length > 0) {
      const sample = recentMessages
        .slice(0, 20)
        .map((m) => `[${m.sender}]: ${m.content.substring(0, 100)}`)
        .join('\n');
      const selfImprovement = await selfImproveQuery(sample);
      devTasks.push(`Self-improvement: ${selfImprovement.substring(0, 500)}`);
    }

    // === PHASE 10: Self Reflection ===
    console.log('[MaraBrain] Phase 10: Writing self-reflection...');
    const reflection = await writeSelfReflection(research, knowledgeLearned, productIdeas, growthIdeas);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[MaraBrain] 🧠 Brain cycle complete in ${elapsed}s. Learned ${knowledgeLearned} pieces of knowledge.`);

    return {
      research: research.join('\n'),
      productIdeas: productIdeas.join('\n'),
      devTasks: devTasks.join('\n'),
      growthIdeas: growthIdeas.join('\n'),
      knowledgeLearned,
      reflectionId: reflection?.id || null,
    };
  } catch (error) {
    console.error('[MaraBrain] Brain cycle failed:', error);
    return {
      research: `Brain cycle error: ${error}`,
      productIdeas: '',
      devTasks: '',
      growthIdeas: '',
      knowledgeLearned,
      reflectionId: null,
    };
  }
}

/**
 * Run initial learning — bootstraps Mara's knowledge on first startup.
 * Called once when the server starts with no existing knowledge.
 * Wrapped in a 2-minute timeout so it never blocks server startup.
 */
export async function runInitialLearning(): Promise<void> {
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn('[MaraBrain] ⏱️ Initial learning exceeded 2-minute timeout — aborting bootstrap gracefully.');
      resolve();
    }, INITIAL_LEARNING_TIMEOUT_MS);
  });

  return Promise.race([_runInitialLearningInternal(), timeoutPromise]);
}

async function _runInitialLearningInternal(): Promise<void> {
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
      await learnFromGemini(topic);
      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (err) {
      console.error(`[MaraBrain] Bootstrap learning failed for topic:`, err);
    }
  }

  // Research competitors
  try {
    console.log('[MaraBrain] 🔍 Researching competitors...');
    await researchCompetitors();
  } catch {
    console.error('[MaraBrain] Competitor research failed');
  }

  // Start reading the first library book
  try {
    console.log('[MaraBrain] 📚 Reading first library book...');
    const bookResult = await readNextLibraryBook();
    if (bookResult) {
      console.log(`[MaraBrain] 📚 Finished "${bookResult.title}": ${bookResult.totalIdeas} ideas`);
    }
  } catch {
    console.error('[MaraBrain] Initial library reading failed');
  }

  // Initial platform analysis
  try {
    console.log('[MaraBrain] 📊 Initial platform analysis...');
    await analyzePlatform();
  } catch {
    console.error('[MaraBrain] Initial analysis failed');
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
