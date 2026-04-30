// Mara Memory System — Per-user memory + Global memory
// Replaces the old mara-brain.ts with an integrated system

import { storage } from '../storage.js';
import { getKnowledgeContext, searchKnowledge, learnFromText } from './knowledge-base.js';
import { buildPersonalityPrompt, detectEmotion, detectToxicity, getToxicityLevel, type ToxicityState } from './personality.js';
import { getPlatformContext } from './platform-context.js';

export interface UserMemoryContext {
  userId: string;
  recentMessages: { role: string; content: string }[];
  preferences: { personality?: string; language?: string } | null;
  emotionalProfile: ReturnType<typeof detectEmotion>;
  toxicityState: ToxicityState;
  knowledgeContext: string;
  personalityPrompt: string;
}

// In-memory toxicity state tracking per user (resets on server restart — that's fine)
const userToxicityStates = new Map<string, ToxicityState>();

function getDefaultToxicityState(): ToxicityState {
  return { level: 0, warmthReduction: 0, consecutiveToxicMessages: 0, lastEscalation: null };
}

/**
 * Build the full context for a user's chat interaction
 * This is the main function that connects personality + memory + knowledge
 */
export async function buildUserContext(
  userId: string,
  currentMessage: string,
  module?: string,
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

  // 4. Update toxicity state
  const currentToxicity = userToxicityStates.get(userId) || getDefaultToxicityState();
  const { isToxic } = detectToxicity(currentMessage);
  const newToxicityState = getToxicityLevel(currentToxicity, isToxic);
  userToxicityStates.set(userId, newToxicityState);

  // 5. Extract topics for knowledge retrieval
  const topics = extractConversationTopics(currentMessage, module);

  // 6. Get relevant knowledge context
  const knowledgeContext = await getKnowledgeContext(topics);

  // 7. Build personality prompt with toxicity and emotion awareness
  const personalityPrompt = buildPersonalityPrompt(newToxicityState, emotionalProfile);

  return {
    userId,
    recentMessages,
    preferences,
    emotionalProfile,
    toxicityState: newToxicityState,
    knowledgeContext,
    personalityPrompt,
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

  return parts.join('\n');
}

/**
 * Record a learning moment from a conversation
 * Now extracts ideas IMMEDIATELY from the conversation (not just queuing)
 */
export async function recordLearningFromChat(
  userId: string,
  userMessage: string,
  maraResponse: string,
  module?: string,
): Promise<void> {
  try {
    // Extract topics the user is interested in
    const topics = extractConversationTopics(userMessage, module);
    if (topics.length === 0) return;

    // Immediate learning: extract structured ideas from the conversation
    const conversationText = `Utilizator (${module || 'general'}): ${userMessage}\n\nMara: ${maraResponse}`;
    if (conversationText.length > 100) {
      // Only extract from substantial conversations
      await learnFromText(conversationText, 'user_interaction', `chat:${userId}:${module || 'general'}`).catch((err) =>
        console.error('[Memory] Immediate learning failed (non-blocking):', err),
      );
    }

    // Also queue unknown topics for deeper research
    for (const topic of topics) {
      const existing = await searchKnowledge(topic, 1);
      if (existing.length === 0) {
        await storage.createLearningTask({
          topic,
          reason: `User ${userId} asked about "${topic}" in ${module || 'general'} chat`,
          priority: 'medium',
          source: 'user_gap',
        });
      }
    }
  } catch (error) {
    console.error('[Memory] Failed to record learning from chat:', error);
  }
}

// Extract conversation topics from a message 
function extractConversationTopics(message: string, module?: string): string[] {
  const topics: string[] = [];
  const lower = message.toLowerCase();

  if (module) topics.push(module);

  const topicKeywords: Record<string, string[]> = {
    trading: ['btc', 'eth', 'bitcoin', 'ethereum', 'crypto', 'trading', 'chart', 'signal', 'market', 'price', 'defi', 'token'],
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
