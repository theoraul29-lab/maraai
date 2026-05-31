// Mara LLM Learner Agent
// Learns from the configured LLM via OpenRouter: asks questions, deepens concepts, validates ideas, self-improves

import { llmGenerate, isLLMConfigured, LLMRateLimitedError } from '../../llm.js';
import { storeKnowledge } from '../knowledge-base.js';
import { storage } from '../../storage.js';
import { rawSqlite } from '../../db.js';

interface LearningResult {
  topic: string;
  learned: string;
  savedKnowledgeIds: number[];
}

/**
 * Ask the LLM to teach Mara about a specific topic
 */
export async function learnFromLLM(topic: string, context?: string): Promise<LearningResult> {
  if (!isLLMConfigured()) {
    return { topic, learned: 'LLM provider not configured', savedKnowledgeIds: [] };
  }

  const prompt = `Tu ești un profesor expert. Eu sunt Mara, un AI care învață continuu pentru a îmbunătăți platforma MaraAI.

Platforma MaraAI are aceste module: Creator Studio (video content), WritersHub (scriere creativă), Reels (video scurt), VIP (servicii premium), Chat AI companion.

${context ? `Context adițional: ${context}\n` : ''}

Vreau să învăț despre: "${topic}"

Răspunde structurat:
1. **Concepte cheie** (3-5 bullet points)
2. **Cum se aplică la o platformă ca MaraAI** (2-3 idei practice)  
3. **Greșeli comune de evitat**
4. **Resurse/direcții de aprofundare**

Fii concis dar informativ. Răspunde în limba română.`;

  try {
    const text = await llmGenerate(prompt, { source: 'agent.llm-learner.learn' });

    // Parse and store knowledge
    const savedIds: number[] = [];

    // Store main knowledge
    const mainId = await storeKnowledge(
      'llm_learning',
      topic,
      text,
      'llm',
      80,
      { learnedAt: new Date().toISOString(), type: 'full_lesson' },
    );
    savedIds.push(mainId);

    // Extract and store key concepts separately for better retrieval
    const concepts = extractConcepts(text);
    for (const concept of concepts) {
      const id = await storeKnowledge(
        'llm_learning',
        `${topic} — ${concept.title}`,
        concept.content,
        'llm',
        75,
        { parentTopic: topic, type: 'concept' },
      );
      savedIds.push(id);
    }

    // Log the search/learning activity
    await storage.createSearchHistory({
      query: topic,
      source: 'llm',
      resultSummary: text.substring(0, 500),
      knowledgeExtracted: JSON.stringify(savedIds),
      triggeredBy: 'brain_cycle',
    });

    return { topic, learned: text, savedKnowledgeIds: savedIds };
  } catch (error) {
    // Same rationale as `learnFromText`: a rate-limit / open-circuit
    // must propagate so Phase 1 can leave the learning_queue task in
    // `pending` for the next cycle. Swallowing it would discard the
    // task with zero saved knowledge and no retry. See PR #96 review.
    if (error instanceof LLMRateLimitedError) {
      throw error;
    }
    console.error(`[LLMLearner] Failed to learn about "${topic}":`, error);
    return { topic, learned: `Error learning about ${topic}`, savedKnowledgeIds: [] };
  }
}

/** @deprecated Use learnFromLLM instead */
export const learnFromGemini = learnFromLLM;

/**
 * Ask the LLM to analyze user patterns and give recommendations
 */
export async function analyzeUserPatterns(patterns: string): Promise<string> {
  if (!isLLMConfigured()) return 'LLM provider not configured';

  const prompt = `Analizează aceste pattern-uri de utilizare ale platformei MaraAI și dă recomandări concrete de îmbunătățire:

${patterns}

Răspunde cu:
1. **Observații principale** (ce indică aceste pattern-uri)
2. **Recomandări** (3-5 sugestii acționabile)
3. **Prioritate** pentru fiecare recomandare (P0-P3)

Fii concis și practic.`;

  try {
    return await llmGenerate(prompt, { source: 'agent.llm-learner.analyze-patterns' });
  } catch (error) {
    console.error('[LLMLearner] Failed to analyze patterns:', error);
    return 'Analysis failed';
  }
}

/**
 * Ask LLM to validate and refine Mara's own improvement ideas
 */
export async function validateIdeas(ideas: string[]): Promise<{ original: string; validation: string; score: number }[]> {
  if (!isLLMConfigured() || ideas.length === 0) return [];

  const prompt = `Evaluează aceste idei de îmbunătățire pentru platforma MaraAI și dă un scor 1-10 fiecăreia:

${ideas.map((idea, i) => `${i + 1}. ${idea}`).join('\n')}

Răspunde în JSON format:
[{"index": 0, "validation": "analiza ta", "score": 7}, ...]

Fii sincer — dacă o idee e slabă, spune de ce.`;

  try {
    const text = (
      await llmGenerate(prompt, { source: 'agent.llm-learner.validate-ideas', thinkingBudget: 5000 })
    ).trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return ideas.map((idea) => ({ original: idea, validation: 'Could not parse', score: 5 }));

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: { index: number; validation: string; score: number }) => ({
      original: ideas[item.index] || 'unknown',
      validation: item.validation,
      score: item.score,
    }));
  } catch (error) {
    console.error('[LLMLearner] Failed to validate ideas:', error);
    return ideas.map((idea) => ({ original: idea, validation: 'Validation failed', score: 5 }));
  }
}

/**
 * Ask LLM how to improve Mara's own responses
 */
export async function selfImproveQuery(recentConversations: string): Promise<string> {
  if (!isLLMConfigured()) return 'LLM provider not configured';

  const prompt = `Eu sunt Mara, un AI conversațional. Analizează aceste conversații recente și spune-mi cum pot răspunde mai bine:

${recentConversations}

Dă-mi 3-5 sugestii concrete de îmbunătățire a răspunsurilor mele. Focus pe:
- Acuratețe
- Ton emoțional
- Valoare practică oferită
- Personalizare`;

  try {
    return await llmGenerate(prompt, { source: 'agent.llm-learner.self-improve' });
  } catch {
    return 'Self-improvement query failed';
  }
}

/**
 * Ask LLM about business strategies for the platform
 */
export async function learnBusinessStrategy(platformContext: string): Promise<LearningResult> {
  return learnFromLLM(
    'Business strategy & growth pentru platformă socială cu AI — creator studio, writers hub, VIP subscriptions, 1M EUR ARR',
    platformContext,
  );
}

/**
 * Explore a topic Mara encountered but doesn't know well
 */
export async function deepenConcept(concept: string, currentKnowledge: string): Promise<LearningResult> {
  return learnFromLLM(
    concept,
    `Ce știu deja: ${currentKnowledge}\n\nVreau să aprofundez acest subiect.`,
  );
}

const VALID_EMOTIONS = new Set([
  'growth', 'confusion', 'excitement', 'ambition', 'insecurity',
  'frustration', 'gratitude', 'curiosity', 'neutral',
]);

/**
 * Update the evolutionary emotional profile for a user.
 *
 * Called fire-and-forget at the end of Phase 1 (brain cycle) after chat
 * excerpts have been processed.  Never blocks the hot conversation path.
 *
 * Rate-limited to once per 24 h per user.  Requires at least 3 recent
 * messages to produce a meaningful signal — skips silently otherwise.
 */
export async function updateUserEmotionalProfile(userId: string): Promise<void> {
  if (!isLLMConfigured()) return;

  try {
    const now = Math.floor(Date.now() / 1000);

    // Rate-limit: skip if updated less than 24 h ago.
    const existing = rawSqlite
      .prepare('SELECT profile_updated_at, mara_confidence FROM user_personality WHERE user_id = ?')
      .get(userId) as { profile_updated_at: number | null; mara_confidence: number | null } | undefined;

    if (existing?.profile_updated_at && now - existing.profile_updated_at < 86400) return;

    // Gather last 7 days of user messages only (not Mara's replies).
    const messages = rawSqlite
      .prepare(`
        SELECT content FROM chat_messages
        WHERE user_id = ? AND sender = 'user'
          AND created_at > ?
        ORDER BY created_at DESC
        LIMIT 30
      `)
      .all(userId, now - 7 * 86400) as Array<{ content: string }>;

    if (messages.length < 3) return;

    const sample = messages.map((m) => m.content).join('\n---\n').slice(0, 2500);

    const prompt = `Analyze these recent messages from a user on the MaraAI self-development platform.
Identify:
1. Their dominant emotional state (pick exactly one: growth, confusion, excitement, ambition, insecurity, frustration, gratitude, curiosity, neutral)
2. Their main topic of interest (a short phrase describing what they discuss most, e.g. "building a writing habit", "content creation on reels", "personal transformation")
3. A confidence delta (-10 to +15) representing how much MORE you now know about this user compared to a baseline first conversation.

Messages:
${sample}

Reply ONLY with valid JSON, no markdown fences, no extra text:
{"dominant_emotion": "...", "dominant_topic": "...", "confidence_delta": 10}`;

    const raw = await llmGenerate(prompt, { source: 'agent.llm-learner.emotional-profile' });
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean) as {
      dominant_emotion: string;
      dominant_topic: string;
      confidence_delta: number;
    };

    const emotion = VALID_EMOTIONS.has(result.dominant_emotion) ? result.dominant_emotion : 'neutral';
    const topic = typeof result.dominant_topic === 'string' ? result.dominant_topic.slice(0, 100) : '';
    const delta = typeof result.confidence_delta === 'number'
      ? Math.min(15, Math.max(-10, result.confidence_delta))
      : 5;

    const currentConfidence = existing?.mara_confidence ?? 0;
    const newConfidence = Math.max(0, Math.min(100, currentConfidence + delta));

    rawSqlite
      .prepare(`
        INSERT INTO user_personality
          (user_id, dominant_emotion, dominant_topic, mara_confidence, profile_updated_at, updated_at)
        VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
        ON CONFLICT(user_id) DO UPDATE SET
          dominant_emotion   = excluded.dominant_emotion,
          dominant_topic     = excluded.dominant_topic,
          mara_confidence    = excluded.mara_confidence,
          profile_updated_at = excluded.profile_updated_at,
          updated_at         = unixepoch()
      `)
      .run(userId, emotion, topic, newConfidence);

    console.log(`[EvoProfile] ${userId}: ${emotion} / "${topic}" / confidence=${newConfidence}`);
  } catch (err) {
    console.warn('[EvoProfile] Failed to update emotional profile (non-fatal):', err);
  }
}

// Helper: extract key concepts from an LLM response
function extractConcepts(text: string): { title: string; content: string }[] {
  const concepts: { title: string; content: string }[] = [];
  const lines = text.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^\*\*(.+?)\*\*/);
    if (headerMatch) {
      if (currentTitle && currentContent.length > 0) {
        concepts.push({ title: currentTitle, content: currentContent.join('\n').trim() });
      }
      currentTitle = headerMatch[1];
      currentContent = [];
    } else if (line.trim()) {
      currentContent.push(line);
    }
  }
  if (currentTitle && currentContent.length > 0) {
    concepts.push({ title: currentTitle, content: currentContent.join('\n').trim() });
  }

  return concepts.slice(0, 5); // Max 5 concepts per lesson
}
