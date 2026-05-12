// Mara Knowledge Base — Long-term memory & knowledge retrieval
// Stores everything Mara learns: from LLM, web, users, self-reflection

import { llmGenerate, isLLMConfigured } from '../llm.js';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { maraKnowledgeBase } from '../../shared/schema.js';
import { sql, inArray, eq, like, desc } from 'drizzle-orm';

export type KnowledgeCategory =
  | 'user_pattern'
  | 'platform_insight'
  | 'business_insight'
  | 'llm_learning'
  | 'gemini_learning'  // kept for backward compatibility with existing data
  | 'web_research'
  | 'book_knowledge';

export type KnowledgeSource =
  | 'llm'
  | 'gemini'           // kept for backward compatibility with existing data
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
 * Store a new piece of knowledge Mara has learned.
 *
 * The read-modify-write (similarity check + upsert) is wrapped in a single
 * SQLite transaction so two concurrent writers cannot both see "no
 * duplicate" and both INSERT a near-identical row. Before this guard the
 * brain cycle (autonomous phases) and user-chat learning could race on the
 * same topic; the resulting duplicates inflated the knowledge base and
 * confused `getKnowledgeContext`. See `audit-mara-brain.md` §F1.
 *
 * Drizzle's better-sqlite3 transaction is synchronous, so the body uses the
 * `.all()` / `.run()` builder API rather than awaiting `storage.*` helpers.
 */
export async function storeKnowledge(
  category: KnowledgeCategory,
  topic: string,
  content: string,
  source: KnowledgeSource,
  confidence = 70,
  metadata: Record<string, unknown> = {},
): Promise<number> {
  return db.transaction((tx) => {
    // Pull candidate duplicates by topic (mirrors storage.getKnowledgeByTopic
    // which fans out to a LIKE search, ordered by confidence).
    const existing = tx
      .select()
      .from(maraKnowledgeBase)
      .where(like(maraKnowledgeBase.topic, `%${topic}%`))
      .orderBy(desc(maraKnowledgeBase.confidence))
      .limit(20)
      .all();
    const duplicate = existing.find(
      (k) =>
        k.category === category &&
        k.source === source &&
        similarity(k.content, content) > 0.8,
    );

    if (duplicate) {
      // Seeing it again — bump confidence (capped at 100), keep the longer
      // content, refresh metadata, and increment access count in one UPDATE
      // so we don't issue two queries inside the transaction.
      const newConfidence = Math.min(100, duplicate.confidence + 5);
      tx.update(maraKnowledgeBase)
        .set({
          content:
            content.length > duplicate.content.length ? content : duplicate.content,
          confidence: newConfidence,
          metadata: JSON.stringify(metadata),
          accessCount: sql`${maraKnowledgeBase.accessCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(maraKnowledgeBase.id, duplicate.id))
        .run();
      return duplicate.id;
    }

    const inserted = tx
      .insert(maraKnowledgeBase)
      .values({
        category,
        topic,
        content,
        source,
        confidence,
        metadata: JSON.stringify(metadata),
      })
      .returning()
      .all();
    return inserted[0].id;
  });
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
  const accessedIds: number[] = [];

  for (const entry of unique) {
    const line = `• [${entry.category}] ${entry.topic}: ${entry.content}`;
    if (charCount + line.length > maxTokens) break;
    lines.push(line);
    charCount += line.length;
    accessedIds.push(entry.id);
  }

  // Batch all access increments in a single UPDATE … WHERE id IN (…)
  if (accessedIds.length > 0) {
    await db
      .update(maraKnowledgeBase)
      .set({ accessCount: sql`${maraKnowledgeBase.accessCount} + 1` })
      .where(inArray(maraKnowledgeBase.id, accessedIds));
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Get stats on what Mara knows — uses a single GROUP BY query instead of
 * loading every row into memory.
 */
export async function getKnowledgeStats(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      category: maraKnowledgeBase.category,
      count: sql<number>`count(*)`,
    })
    .from(maraKnowledgeBase)
    .groupBy(maraKnowledgeBase.category);

  const stats: Record<string, number> = { total: 0 };
  for (const row of rows) {
    stats[row.category] = row.count;
    stats.total += row.count;
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
  if (!isLLMConfigured()) {
    return { ideas: [], savedIds: [] };
  }

  const prompt = `Analizează acest text și extrage idei utile. Pentru fiecare idee, returnează JSON structurat.

TEXT:
"""
${text.substring(0, 4000)}
"""

Returnează un JSON array cu maxim 5 idei, fiecare cu aceste câmpuri:
- "idea": ideea principală (1-2 propoziții)
- "category": una din: business_insight, platform_insight, user_pattern, llm_learning, web_research, book_knowledge
- "how_to_apply": cum se poate aplica concret pe platforma MaraAI (1-2 propoziții)

Răspunde DOAR cu JSON array-ul, fără alt text. Exemplu:
[{"idea":"...", "category":"business_insight", "how_to_apply":"..."}]`;

  try {
    const raw = (
      await llmGenerate(prompt, { source: 'learning.extract-ideas' })
    ).trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(
        `[KnowledgeBase] learnFromText: no JSON array in LLM output for "${sourceLabel ?? 'unknown'}". Raw head: ${raw.slice(0, 200)}`,
      );
      return { ideas: [], savedIds: [] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.warn(
        `[KnowledgeBase] learnFromText: JSON.parse failed for "${sourceLabel ?? 'unknown'}":`,
        parseErr instanceof Error ? parseErr.message : parseErr,
      );
      return { ideas: [], savedIds: [] };
    }
    if (!Array.isArray(parsed)) return { ideas: [], savedIds: [] };

    const savedIds: number[] = [];
    const validIdeas: ExtractedIdea[] = [];

    // The prompt asks the LLM for snake_case `how_to_apply` but the TS
    // interface uses camelCase `howToApply` — normalize defensively so any
    // shape from the model (snake_case, camelCase, or even the bare alias
    // `application`) is accepted. Without this, every item was silently
    // filtered out and books were marked as read with 0 ideas extracted.
    for (const rawItem of parsed) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const obj = rawItem as Record<string, unknown>;

      const idea = typeof obj.idea === 'string' ? obj.idea.trim() : '';
      const category = typeof obj.category === 'string' ? obj.category.trim() : '';
      const howToApplyRaw =
        (typeof obj.howToApply === 'string' && obj.howToApply) ||
        (typeof obj.how_to_apply === 'string' && obj.how_to_apply) ||
        (typeof obj.application === 'string' && obj.application) ||
        '';
      const howToApply = typeof howToApplyRaw === 'string' ? howToApplyRaw.trim() : '';

      if (!idea || !category || !howToApply) continue;

      const validCategory = (['business_insight', 'platform_insight', 'user_pattern', 'llm_learning', 'web_research', 'book_knowledge'] as KnowledgeCategory[]).includes(category as KnowledgeCategory)
        ? (category as KnowledgeCategory)
        : 'book_knowledge';

      const id = await storeKnowledge(
        validCategory,
        idea.substring(0, 100),
        `${idea}\n\nCum se aplică: ${howToApply}`,
        source,
        75,
        { sourceLabel: sourceLabel || 'text_extraction', extractedAt: new Date().toISOString() },
      );
      savedIds.push(id);
      validIdeas.push({ idea, category: validCategory, howToApply });
    }

    if (validIdeas.length === 0) {
      console.warn(
        `[KnowledgeBase] learnFromText: parsed ${Array.isArray(parsed) ? parsed.length : 0} item(s) but 0 valid for "${sourceLabel ?? 'unknown'}"`,
      );
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
