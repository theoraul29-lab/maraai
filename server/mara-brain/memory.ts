// Mara Memory System — Per-user memory + Global memory
// Replaces the old mara-brain.ts with an integrated system

import { storage } from '../storage.js';
import { getKnowledgeContext, searchKnowledge } from './knowledge-base.js';
import { buildPersonalityPrompt, detectEmotion, detectToxicity, getToxicityLevel, type ToxicityState } from './personality.js';
import { getPlatformContext } from './platform-context.js';
import { rawSqlite } from '../db.js';
import { executive } from '../mara-core/executive.js';
import { getInvestigatorContext } from '../maraai/qualitative-signals.js';
import { getMissionContextForMara } from '../missions/engine.js';

export interface UserMemoryContext {
  userId: string;
  isAdmin: boolean;
  recentMessages: { role: string; content: string }[];
  preferences: { personality?: string; language?: string } | null;
  emotionalProfile: ReturnType<typeof detectEmotion>;
  toxicityState: ToxicityState;
  knowledgeContext: string;
  personalityPrompt: string;
  investigatorContext: string;
  userMemories: string;
  /** Active missions + completion summary in the user's language. Injected into system prompt. */
  missionsContext: string;
  /** Evolved profile updated async by the brain cycle. Empty string if not yet computed. */
  evolvedProfile: string;
}

function getDefaultToxicityState(): ToxicityState {
  return { level: 0, warmthReduction: 0, consecutiveToxicMessages: 0, lastEscalation: null };
}

function getToxicityStateFromDb(userId: string): ToxicityState {
  try {
    const row = rawSqlite
      .prepare('SELECT level, warmth_reduction, consecutive_toxic_messages, last_escalation FROM user_toxicity_state WHERE user_id = ?')
      .get(userId) as { level: number; warmth_reduction: number; consecutive_toxic_messages: number; last_escalation: string | null } | undefined;
    if (!row) return getDefaultToxicityState();
    return {
      level: (row.level ?? 0) as ToxicityState['level'],
      warmthReduction: row.warmth_reduction ?? 0,
      consecutiveToxicMessages: row.consecutive_toxic_messages ?? 0,
      lastEscalation: row.last_escalation ?? null,
    };
  } catch {
    return getDefaultToxicityState();
  }
}

function saveToxicityStateToDb(userId: string, state: ToxicityState): void {
  try {
    rawSqlite
      .prepare(`
        INSERT INTO user_toxicity_state (user_id, level, warmth_reduction, consecutive_toxic_messages, last_escalation, updated_at)
        VALUES (?, ?, ?, ?, ?, unixepoch())
        ON CONFLICT(user_id) DO UPDATE SET
          level = excluded.level,
          warmth_reduction = excluded.warmth_reduction,
          consecutive_toxic_messages = excluded.consecutive_toxic_messages,
          last_escalation = excluded.last_escalation,
          updated_at = unixepoch()
      `)
      .run(userId, state.level, state.warmthReduction, state.consecutiveToxicMessages, state.lastEscalation ?? null);
  } catch (err) {
    console.warn('[Memory] Failed to save toxicity state:', err);
  }
}

/**
 * Decay toxicity for users who haven't triggered an escalation in 7+ days.
 * Called at the end of every brain cycle.
 */
export function decayAllToxicity(): void {
  try {
    rawSqlite
      .prepare(`
        UPDATE user_toxicity_state
        SET level = MAX(0, level - 1),
            warmth_reduction = MAX(0, warmth_reduction - 10),
            consecutive_toxic_messages = 0,
            updated_at = unixepoch()
        WHERE updated_at < unixepoch() - 7 * 86400
          AND level > 0
      `)
      .run();
  } catch (err) {
    console.warn('[Memory] Failed to decay toxicity:', err);
  }
}

/**
 * Build the full context for a user's chat interaction
 * This is the main function that connects personality + memory + knowledge.
 *
 * When `isAdmin` is true, Mara switches to the admin persona
 * (see buildPersonalityPrompt). Toxicity scaffolding is still tracked but
 * not surfaced in the prompt, so the per-user state still gets cleaned up
 * if the admin happens to test a toxic message.
 */
export async function buildUserContext(
  userId: string,
  currentMessage: string,
  module?: string,
  isAdmin: boolean = false,
): Promise<UserMemoryContext> {
  // 1. Get user preferences
  const preferences = await storage.getUserPreferences(userId);

  // 2. Get recent conversation history
  const history = await storage.getChatMessages(userId);
  const recentMessages = history.slice(-20).map((m) => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  // 3. Detect emotion from current message
  const emotionalProfile = detectEmotion(currentMessage);

  // 4. Update toxicity state (persisted in DB across restarts)
  const currentToxicity = getToxicityStateFromDb(userId);
  const { isToxic } = detectToxicity(currentMessage);
  const newToxicityState = getToxicityLevel(currentToxicity, isToxic);
  saveToxicityStateToDb(userId, newToxicityState);

  // 5. Extract topics for knowledge retrieval
  const topics = extractConversationTopics(currentMessage, module);

  // 6. Get relevant knowledge context
  const knowledgeContext = await getKnowledgeContext(topics);

  // 7. Build personality prompt with toxicity, emotion, and admin awareness.
  //    When isAdmin=true, the admin persona replaces the entire user-facing
  //    block — toxicity & emotion still tracked but not surfaced in the prompt.
  const personalityPrompt = buildPersonalityPrompt(newToxicityState, emotionalProfile, isAdmin);

  // 8. Investigator signals — mission abandonment, returning user, not activated.
  //    Skipped for admin sessions (not relevant for internal testing).
  const investigatorContext = isAdmin ? '' : getInvestigatorContext(userId);

  // 9. Per-user long-term memories (goals, preferences, personal facts shared in past chats)
  const userMemories = isAdmin ? '' : getUserMemories(userId);

  // 10. Mission context — active missions with details + completion summary.
  //     Sync (reads from translation cache), safe to call on every request.
  const lang = preferences?.language || undefined;
  const missionsContext = isAdmin ? '' : getMissionContextForMara(userId, lang);

  // 11. Evolved emotional profile — written async by brain cycle Phase 1.5.
  //     Read-only here; never blocks the response.
  const evolvedProfile = isAdmin ? '' : getEvolvedProfile(userId);

  return {
    userId,
    isAdmin,
    recentMessages,
    preferences,
    emotionalProfile,
    toxicityState: newToxicityState,
    knowledgeContext,
    personalityPrompt,
    investigatorContext,
    userMemories,
    missionsContext,
    evolvedProfile,
  };
}

/**
 * Build the complete system instruction for Gemini
 * Combines personality + knowledge + module context
 */
export function buildSystemInstruction(context: UserMemoryContext, language?: string): string {
  const parts: string[] = [context.personalityPrompt];

  // Platform context — Mara knows she lives on MaraAI and can guide users.
  const lang = language || context.preferences?.language || 'ro';
  parts.push('', getPlatformContext(lang));

  // Language instruction (keep lang var below for the block after knowledge)
  if (lang === 'ro') {
    parts.push('\n# LIMBĂ\nRăspunde în limba română.');
  } else if (lang === 'en') {
    parts.push('\n# LANGUAGE\nRespond in English.');
  } else {
    parts.push(`\n# LANGUAGE\nAlways respond in the language with code "${lang}". Do not switch to English or Romanian unless the user explicitly asks.`);
  }

  // Knowledge context
  if (context.knowledgeContext) {
    parts.push(`\n# CUNOȘTINȚE RELEVANTE\n${context.knowledgeContext}`);
  }

  // Strategic context from ExecutiveReasoning (funnel state, active experiments)
  const executiveCtx = executive.getContextForConversation();
  if (executiveCtx) parts.push(executiveCtx);

  // Active missions + journey context — Mara knows where the user is
  if (context.missionsContext) {
    parts.push(
      `\n# MISIUNILE USERULUI\n${context.missionsContext}\n` +
      `Use this to guide and motivate the user. Reference their active missions naturally when relevant. ` +
      `If they ask about a step or how to do something, you now know the exact task details.`
    );
  }

  // Qualitative investigator signals (mission abandoned, returning user, not activated)
  if (context.investigatorContext) parts.push(context.investigatorContext);

  // Per-user long-term memories — things the user has shared in past conversations
  if (context.userMemories) {
    parts.push(`\n# CE ȘTI DESPRE ACEST USER\n${context.userMemories}\nFolosește aceste informații pentru a personaliza răspunsurile. Nu repeta mecanic faptele — referă-te natural la ele când e relevant.`);
  }

  // Evolutionary profile — updated async by brain cycle, reflects recent behaviour
  if (context.evolvedProfile) {
    parts.push(
      `\n# PROFIL EMOȚIONAL EVOLUTIV\n${context.evolvedProfile}\n` +
      `Let this guide your tone and framing. If the user shows ambition, match it with energy. ` +
      `If they show confusion, slow down and clarify. ` +
      `If Mara's familiarity is high, be more personal and skip basic introductions.`,
    );
  }

  return parts.join('\n');
}

/**
 * Record a learning moment from a conversation.
 *
 * Previously this fired `learnFromText` inline (one LLM call per chat
 * message) which:
 *   1. Bypassed the autonomous rate limiter (LLM cost ran away with chat
 *      traffic).
 *   2. Raced with the brain cycle's phases on `mara_knowledge_base` —
 *      both writers could see "no duplicate" simultaneously and both
 *      insert near-identical rows (audit §F1).
 *
 * Now it ONLY enqueues into `mara_learning_queue`. The brain cycle's
 * Phase 1 picks tasks up and processes them serially under the manager's
 * single-cycle lock + the universal rate-limit funnel. The conversation
 * excerpt rides along on the `reason` column so Phase 1 can feed it back
 * to `learnFromText` exactly once, on the autonomous path, where the
 * `storeKnowledge` transaction guards against duplicates.
 *
 * This keeps chat latency to a single DB INSERT (no synchronous LLM call)
 * while still feeding everything the user says back into Mara's knowledge
 * base. See `audit-mara-brain.md` §4 (Phase 1 of Option A migration).
 */
export async function recordLearningFromChat(
  userId: string,
  userMessage: string,
  maraResponse: string,
  module?: string,
): Promise<void> {
  // Feed signal into ExecutiveReasoning ring buffer (synchronous, never throws)
  executive.recordSignal(userId, userMessage, module);

  try {
    const topics = extractConversationTopics(userMessage, module);
    if (topics.length === 0) return;

    const moduleLabel = module || 'general';
    const conversationText = `Utilizator (${moduleLabel}): ${userMessage}\n\nMara: ${maraResponse}`;

    // 1) Stage the conversation snippet for autonomous extraction by Phase 1.
    //    The brain cycle's queue processor reads `task.source === 'chat_excerpt'`
    //    and feeds `task.reason` into `learnFromText` instead of the topic-broad
    //    `learnFromLLM` it uses for `auto`/`user_gap` tasks.
    if (conversationText.length > 100) {
      await storage.createLearningTask({
        topic: `chat:${userId}:${moduleLabel}`,
        reason: conversationText.slice(0, 4000),
        priority: 'medium',
        source: 'chat_excerpt',
      });
    }

    // 0) Extract and persist personal facts shared by the user (no LLM call — heuristic only)
    for (const { fact, category } of extractPersonalFacts(userMessage)) {
      storeUserMemory(userId, fact, category);
    }

    // 2) Also queue unknown topics for deeper research. We still gate on
    //    `searchKnowledge` first so we don't pile up tasks for things Mara
    //    already knows about — Phase 1 will dedupe internally too, but
    //    skipping the INSERT keeps the queue table tidy.
    for (const topic of topics) {
      const existing = await searchKnowledge(topic, 1);
      if (existing.length === 0) {
        await storage.createLearningTask({
          topic,
          reason: `User ${userId} asked about "${topic}" in ${moduleLabel} chat`,
          priority: 'medium',
          source: 'user_gap',
        });
      }
    }
  } catch (error) {
    console.error('[Memory] Failed to record learning from chat:', error);
  }
}

// ─── Per-user long-term memory ────────────────────────────────────────────────

export type MemoryCategory = 'goal' | 'preference' | 'personal_info' | 'interest' | 'achievement' | 'general';

const PERSONAL_PATTERNS: Array<{ re: RegExp; category: MemoryCategory }> = [
  { re: /\b(mă numesc|numele meu e|my name is|me llamo|je m'appelle|ich heiße)\b/i, category: 'personal_info' },
  { re: /\b(am \d+ ani|i'm \d+ years|tengo \d+ años|j'ai \d+ ans)\b/i, category: 'personal_info' },
  { re: /\b(lucrez|work at|trabajo en|je travaille|ich arbeite)\b/i, category: 'personal_info' },
  { re: /\b(sunt (scriitor|creator|developer|designer|antreprenor|student|profesor|doctor)|i am a |i'm a )\b/i, category: 'personal_info' },
  { re: /\b(îmi place|îmi plac|iubesc|ador|my favorite|i love|i like|me encanta|j'aime|ich liebe)\b/i, category: 'preference' },
  { re: /\b(vreau să|want to|quiero|je veux|ich will|my goal is|obiectivul meu)\b/i, category: 'goal' },
  { re: /\b(lucrez la|building|construiesc|am un proiect|my project|working on)\b/i, category: 'goal' },
  { re: /\b(îmi place să scriu|love writing|pasionat de|passionate about|hobby|interesat de|interested in)\b/i, category: 'interest' },
  { re: /\b(am terminat|am finalizat|am reușit|i finished|i completed|i achieved)\b/i, category: 'achievement' },
];

export function extractPersonalFacts(message: string): Array<{ fact: string; category: MemoryCategory }> {
  const facts: Array<{ fact: string; category: MemoryCategory }> = [];
  const trimmed = message.trim();
  if (trimmed.length < 10 || trimmed.length > 500) return facts;

  for (const { re, category } of PERSONAL_PATTERNS) {
    if (re.test(trimmed)) {
      facts.push({ fact: trimmed.slice(0, 300), category });
      break;
    }
  }
  return facts;
}

export function storeUserMemory(userId: string, fact: string, category: MemoryCategory = 'general'): void {
  try {
    const existing = rawSqlite
      .prepare('SELECT id FROM user_memories WHERE user_id = ? AND fact = ?')
      .get(userId, fact);
    if (existing) return;
    rawSqlite
      .prepare('INSERT INTO user_memories (user_id, fact, category) VALUES (?, ?, ?)')
      .run(userId, fact.slice(0, 500), category);
  } catch (err) {
    console.warn('[Memory] Failed to store user memory:', err);
  }
}

/**
 * Read the brain-cycle-generated evolutionary emotional profile for a user.
 * Returns an empty string if the profile hasn't been computed yet.
 * No LLM call — pure DB read, safe on the hot path.
 */
export function getEvolvedProfile(userId: string): string {
  try {
    const row = rawSqlite
      .prepare(`
        SELECT dominant_emotion, dominant_topic, mara_confidence
        FROM user_personality
        WHERE user_id = ?
          AND dominant_emotion IS NOT NULL
          AND profile_updated_at IS NOT NULL
      `)
      .get(userId) as {
        dominant_emotion: string;
        dominant_topic: string;
        mara_confidence: number;
      } | undefined;
    if (!row) return '';
    const confidence = row.mara_confidence ?? 0;
    const confidenceLabel = confidence < 30 ? 'getting to know them'
      : confidence < 60 ? 'moderately familiar'
      : 'knows them well';
    return (
      `Dominant emotion (last 7 days): ${row.dominant_emotion}\n` +
      `Main topic of interest: ${row.dominant_topic}\n` +
      `Mara's familiarity: ${confidence}/100 (${confidenceLabel})`
    );
  } catch {
    return '';
  }
}

export function getUserMemories(userId: string, limit = 12): string {
  try {
    const rows = rawSqlite
      .prepare('SELECT fact, category FROM user_memories WHERE user_id = ? ORDER BY last_accessed DESC, created_at DESC LIMIT ?')
      .all(userId, limit) as Array<{ fact: string; category: string }>;
    if (rows.length === 0) return '';
    rawSqlite
      .prepare('UPDATE user_memories SET last_accessed = unixepoch() WHERE user_id = ?')
      .run(userId);
    return rows.map((r) => `[${r.category}] ${r.fact}`).join('\n');
  } catch {
    return '';
  }
}

// Extract conversation topics from a message
function extractConversationTopics(message: string, module?: string): string[] {
  const topics: string[] = [];
  const lower = message.toLowerCase();

  if (module) topics.push(module);

  const topicKeywords: Record<string, string[]> = {
    missions: ['misiune', 'mission', 'task', 'provocare', 'challenge', 'xp', 'pillar', 'jurnal', 'journal', 'program', 'streak'],
    writing: ['write', 'book', 'story', 'manuscript', 'article', 'poetry', 'essay', 'scrie', 'carte', 'poveste'],
    content: ['video', 'creator', 'content', 'reel', 'post', 'upload', 'publish', 'viral', 'engagement'],
    business: ['monetize', 'revenue', 'growth', 'strategy', 'premium', 'vip', 'subscribe', 'bani', 'profit', 'afacere'],
    tech: ['code', 'dev', 'api', 'database', 'server', 'deploy', 'bug', 'feature', 'performance'],
    learning: ['learn', 'teach', 'course', 'tutorial', 'cum', 'how', 'explain', 'explică'],
  };

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((k) => lower.includes(k))) {
      topics.push(topic);
    }
  }

  return Array.from(new Set(topics));
}
