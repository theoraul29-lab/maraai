// Mara LLM Learner Agent
// Learns from the configured LLM via OpenRouter: asks questions, deepens concepts, validates ideas, self-improves

import { llmGenerate, isLLMConfigured } from '../../llm.js';
import { storeKnowledge } from '../knowledge-base.js';
import { storage } from '../../storage.js';

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

Platforma MaraAI are aceste module: Trading (50 strategii crypto), Creator Studio (video content), WritersHub (scriere creativă), Reels (video scurt), VIP (servicii premium), Chat AI.

${context ? `Context adițional: ${context}\n` : ''}

Vreau să învăț despre: "${topic}"

Răspunde structurat:
1. **Concepte cheie** (3-5 bullet points)
2. **Cum se aplică la o platformă ca MaraAI** (2-3 idei practice)  
3. **Greșeli comune de evitat**
4. **Resurse/direcții de aprofundare**

Fii concis dar informativ. Răspunde în limba română.`;

  try {
    const text = await llmGenerate(prompt);

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
    return await llmGenerate(prompt);
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
    const text = (await llmGenerate(prompt)).trim();
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
    return await llmGenerate(prompt);
  } catch {
    return 'Self-improvement query failed';
  }
}

/**
 * Ask LLM about business strategies for the platform
 */
export async function learnBusinessStrategy(platformContext: string): Promise<LearningResult> {
  return learnFromLLM(
    'Business strategy & growth pentru platformă socială cu AI, trading crypto, creator studio, și writers hub',
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
