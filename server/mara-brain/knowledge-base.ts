// Mara Knowledge Base — Long-term memory & knowledge retrieval
// Stores everything Mara learns: from Gemini, web, users, self-reflection

import { GoogleGenerativeAI } from '@google/generative-ai';
import { storage } from '../storage.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export type KnowledgeCategory =
  | 'user_pattern'
  | 'platform_insight'
  | 'business_insight'
  | 'gemini_learning'
  | 'web_research'
  | 'book_knowledge';

export type KnowledgeSource =
  | 'gemini'
  | 'web'
  | 'user_interaction'
  | 'self_reflection'
  | 'document';

export interface KnowledgeSearchResult {
  id: number;
  topic: string;
  content: string;
  category: string;
  confidence: number;
  relevanceScore: number;
}

/**
 * Store a new piece of knowledge Mara has learned
 */
export async function storeKnowledge(
  category: KnowledgeCategory,
  topic: string,
  content: string,
  source: KnowledgeSource,
  confidence = 70,
  metadata: Record<string, unknown> = {},
): Promise<number> {
  // Check if similar knowledge already exists
  const existing = await storage.getKnowledgeByTopic(topic);
  const duplicate = existing.find(
    (k) => k.category === category && k.source === source && similarity(k.content, content) > 0.8,
  );

  if (duplicate) {
    // Update existing with higher confidence if we're seeing it again
    const newConfidence = Math.min(100, duplicate.confidence + 5);
    await storage.updateKnowledgeEntry(duplicate.id, {
      content: content.length > duplicate.content.length ? content : duplicate.content,
      confidence: newConfidence,
      metadata: JSON.stringify(metadata),
    });
    await storage.incrementKnowledgeAccess(duplicate.id);
    return duplicate.id;
  }

  const entry = await storage.createKnowledgeEntry({
    category,
    topic,
    content,
    source,
    confidence,
    metadata: JSON.stringify(metadata),
  });
  return entry.id;
}

/**
 * Search the knowledge base for relevant information
 */
export async function searchKnowledge(query: string, limit = 10): Promise<KnowledgeSearchResult[]> {
  const allKnowledge = await storage.getKnowledgeByTopic(query);

  // Score by relevance
  return allKnowledge
    .map((k) => ({
      id: k.id,
      topic: k.topic,
      content: k.content,
      category: k.category,
      confidence: k.confidence,
      relevanceScore: computeRelevance(query, k.topic, k.content),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

/**
 * Get a context window of relevant knowledge for a conversation
 */
export async function getKnowledgeContext(topics: string[], maxTokens = 2000): Promise<string> {
  const results: KnowledgeSearchResult[] = [];

  for (const topic of topics) {
    const found = await searchKnowledge(topic, 3);
    results.push(...found);
  }

  // Deduplicate by ID
  const unique = Array.from(new Map(results.map((r) => [r.id, r] as [number, KnowledgeSearchResult])).values());
  unique.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const lines: string[] = ['[Mara Knowledge Context]'];
  let charCount = 0;

  for (const entry of unique) {
    const line = `• [${entry.category}] ${entry.topic}: ${entry.content}`;
    if (charCount + line.length > maxTokens) break;
    lines.push(line);
    charCount += line.length;
    await storage.incrementKnowledgeAccess(entry.id);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Get stats on what Mara knows
 */
export async function getKnowledgeStats(): Promise<Record<string, number>> {
  const all = await storage.getAllKnowledge(10000);
  const stats: Record<string, number> = { total: all.length };
  for (const entry of all) {
    stats[entry.category] = (stats[entry.category] || 0) + 1;
  }
  return stats;
}

export interface ExtractedIdea {
  idea: string;
  category: string;
  howToApply: string;
}

/**
 * Learn from a block of text — uses Gemini to extract structured ideas
 * Returns an array of ideas with category and how_to_apply fields
 */
export async function learnFromText(
  text: string,
  source: KnowledgeSource = 'document',
  sourceLabel?: string,
): Promise<{ ideas: ExtractedIdea[]; savedIds: number[] }> {
  if (!process.env.GEMINI_API_KEY) {
    return { ideas: [], savedIds: [] };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Analizează acest text și extrage idei utile. Pentru fiecare idee, returnează JSON structurat.

TEXT:
"""
${text.substring(0, 4000)}
"""

Returnează un JSON array cu maxim 5 idei, fiecare cu aceste câmpuri:
- "idea": ideea principală (1-2 propoziții)
- "category": una din: business_insight, platform_insight, user_pattern, gemini_learning, web_research, book_knowledge
- "how_to_apply": cum se poate aplica concret pe platforma MaraAI (1-2 propoziții)

Răspunde DOAR cu JSON array-ul, fără alt text. Exemplu:
[{"idea":"...", "category":"business_insight", "how_to_apply":"..."}]`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { ideas: [], savedIds: [] };

    const parsed: ExtractedIdea[] = JSON.parse(jsonMatch[0]);
    const savedIds: number[] = [];
    const validIdeas: ExtractedIdea[] = [];

    for (const item of parsed) {
      if (!item.idea || !item.category || !item.howToApply) continue;

      const validCategory = (['business_insight', 'platform_insight', 'user_pattern', 'gemini_learning', 'web_research', 'book_knowledge'] as KnowledgeCategory[]).includes(item.category as KnowledgeCategory)
        ? (item.category as KnowledgeCategory)
        : 'book_knowledge';

      const id = await storeKnowledge(
        validCategory,
        item.idea.substring(0, 100),
        `${item.idea}\n\nCum se aplică: ${item.howToApply}`,
        source,
        75,
        { sourceLabel: sourceLabel || 'text_extraction', extractedAt: new Date().toISOString() },
      );
      savedIds.push(id);
      validIdeas.push(item);
    }

    return { ideas: validIdeas, savedIds };
  } catch (error) {
    console.error('[KnowledgeBase] learnFromText failed:', error);
    return { ideas: [], savedIds: [] };
  }
}

// Simple word overlap similarity
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = Array.from(wordsA).filter((w) => wordsB.has(w));
  const union = new Set(Array.from(wordsA).concat(Array.from(wordsB)));
  return union.size > 0 ? intersection.length / union.size : 0;
}

// Compute relevance score based on query match
function computeRelevance(query: string, topic: string, content: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const topicLower = topic.toLowerCase();
  const contentLower = content.toLowerCase();

  let score = 0;
  for (const word of queryWords) {
    if (topicLower.includes(word)) score += 3;
    if (contentLower.includes(word)) score += 1;
  }

  return score;
}
