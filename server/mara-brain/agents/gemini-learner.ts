// Mara LLM Learner Agent
// Learns from the configured LLM (OpenRouter): asks questions, deepens concepts, validates ideas, self-improves

import { isOpenRouterConfigured, generate } from '../../openrouter.js';
import { storeKnowledge } from '../knowledge-base.js';
import { storage } from '../../storage.js';

interface LearningResult {
  topic: string;
  learned: string;
  savedKnowledgeIds: number[];
}

/**
 * Ask Gemini to teach Mara about a specific topic
 */
export async function learnFromGemini(topic: string, context?: string): Promise<LearningResult> {
  if (!isOpenRouterConfigured()) {
    return { topic, learned: 'LLM API key not configured', savedKnowledgeIds: [] };
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
    const text = await generate(prompt);

    // Parse and store knowledge
    const savedIds: number[] = [];

    // Store main knowledge
    const mainId = await storeKnowledge(
      'gemini_learning',
      topic,
      text,
      'gemini',
      80,
      { learnedAt: new Date().toISOString(), type: 'full_lesson' },
    );
    savedIds.push(mainId);

    // Extract and store key concepts separately for better retrieval
    const concepts = extractConcepts(text);
    for (const concept of concepts) {
      const id = await storeKnowledge(
        'gemini_learning',
        `${topic} — ${concept.title}`,
        concept.content,
        'gemini',
        75,
        { parentTopic: topic, type: 'concept' },
      );
      savedIds.push(id);
    }

    // Log the search/learning activity
    await storage.createSearchHistory({
      query: topic,
      source: 'gemini',
      resultSummary: text.substring(0, 500),
      knowledgeExtracted: JSON.stringify(savedIds),
      triggeredBy: 'brain_cycle',
    });

    return { topic, learned: text, savedKnowledgeIds: savedIds };
  } catch (error) {
    console.error(`[GeminiLearner] Failed to learn about "${topic}":`, error);
    return { topic, learned: `Error learning about ${topic}`, savedKnowledgeIds: [] };
  }
}

/**
 * Ask Gemini to analyze user patterns and give recommendations
 */
export async function analyzeUserPatterns(patterns: string): Promise<string> {
  if (!isOpenRouterConfigured()) return 'LLM API key not configured';

  const prompt = `Analizează aceste pattern-uri de utilizare ale platformei MaraAI și dă recomandări concrete de îmbunătățire:

${patterns}

Răspunde cu:
1. **Observații principale** (ce indică aceste pattern-uri)
2. **Recomandări** (3-5 sugestii acționabile)
3. **Prioritate** pentru fiecare recomandare (P0-P3)

Fii concis și practic.`;

  try {
    return await generate(prompt);
  } catch (error) {
    console.error('[GeminiLearner] Failed to analyze patterns:', error);
    return 'Analysis failed';
  }
}

/**
 * Ask Gemini to validate and refine Mara's own improvement ideas
 */
export async function validateIdeas(ideas: string[]): Promise<{ original: string; validation: string; score: number }[]> {
  if (!isOpenRouterConfigured() || ideas.length === 0) return [];

  const prompt = `Evaluează aceste idei de îmbunătățire pentru platforma MaraAI și dă un scor 1-10 fiecăreia:

${ideas.map((idea, i) => `${i + 1}. ${idea}`).join('\n')}

Răspunde în JSON format:
[{"index": 0, "validation": "analiza ta", "score": 7}, ...]

Fii sincer — dacă o idee e slabă, spune de ce.`;

  try {
    const text = await generate(prompt);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return ideas.map((idea) => ({ original: idea, validation: 'Could not parse', score: 5 }));

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: { index: number; validation: string; score: number }) => ({
      original: ideas[item.index] || 'unknown',
      validation: item.validation,
      score: item.score,
    }));
  } catch (error) {
    console.error('[GeminiLearner] Failed to validate ideas:', error);
    return ideas.map((idea) => ({ original: idea, validation: 'Validation failed', score: 5 }));
  }
}

/**
 * Ask Gemini how to improve Mara's own responses
 */
export async function selfImproveQuery(recentConversations: string): Promise<string> {
  if (!isOpenRouterConfigured()) return 'API key not configured';

  const prompt = `Eu sunt Mara, un AI conversațional. Analizează aceste conversații recente și spune-mi cum pot răspunde mai bine:

${recentConversations}

Dă-mi 3-5 sugestii concrete de îmbunătățire a răspunsurilor mele. Focus pe:
- Acuratețe
- Ton emoțional
- Valoare practică oferită
- Personalizare`;

  try {
    return await generate(prompt);
  } catch {
    return 'Self-improvement query failed';
  }
}

/**
 * Ask Gemini about business strategies for the platform
 */
export async function learnBusinessStrategy(platformContext: string): Promise<LearningResult> {
  return learnFromGemini(
    'Business strategy & growth pentru platformă socială cu AI, trading crypto, creator studio, și writers hub',
    platformContext,
  );
}

/**
 * Explore a topic Mara encountered but doesn't know well
 */
export async function deepenConcept(concept: string, currentKnowledge: string): Promise<LearningResult> {
  return learnFromGemini(
    concept,
    `Ce știu deja: ${currentKnowledge}\n\nVreau să aprofundez acest subiect.`,
  );
}

// Helper: extract key concepts from a Gemini response
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
