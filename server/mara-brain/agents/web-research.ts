// Mara Web Research Agent
// Searches the internet for information, trends, and knowledge
// Uses the configured LLM provider for web-grounded queries

import { llmGenerate, isLLMConfigured, LLMRateLimitedError } from '../../llm.js';
import { storeKnowledge } from '../knowledge-base.js';
import { storage } from '../../storage.js';
import { webSearch, formatSearchResultsForPrompt } from '../../lib/web-search.js';
import { learningRateLimiter } from '../rate-limiter.js';

interface WebResearchResult {
  query: string;
  findings: string;
  knowledgeIds: number[];
  source: string;
}

/**
 * Research a topic using the configured LLM's knowledge (grounded in training data)
 */
export async function researchTopic(query: string, context?: string): Promise<WebResearchResult> {
  if (!isLLMConfigured()) {
    return { query, findings: 'LLM provider not configured', knowledgeIds: [], source: 'none' };
  }

  // Skip web search entirely if the LLM cap is already exhausted — avoid
  // burning Serper/DuckDuckGo quota for a call that will be discarded anyway.
  if (!learningRateLimiter.canCall()) {
    throw new LLMRateLimitedError('agent.web-research.research');
  }

  // Fetch real web results first (Serper → DuckDuckGo fallback)
  const searchResults = await webSearch(query, 5);
  const searchContext = formatSearchResultsForPrompt(searchResults);
  const usedRealSearch = searchResults.length > 0;

  const prompt = `Ești un agent de research al platformei MaraAI. Analizează și raportează despre:

"${query}"

${searchContext ? `REZULTATE WEB REALE:\n${searchContext}\n\n` : ''}${context ? `Context: ${context}\n\n` : ''}Cerințe:
1. Prezintă informații **actuale și verificabile**${usedRealSearch ? ' din rezultatele web de mai sus' : ''}
2. Include **date concrete** (numere, statistici) unde e posibil
3. Evidențiază ce e **relevant pentru o platformă AI** cu: missions & growth programs, creator studio, writers hub, social reels
4. Semnalează orice **trend emergent** care ar trebui urmărit

Format:
- **Rezumat**: (2-3 propoziții)
- **Detalii cheie**: (bullet points)
- **Relevanță MaraAI**: (cum se aplică)
- **Acțiuni recomandate**: (ce ar trebui să facem)

Răspunde în română.`;

  try {
    const text = await llmGenerate(prompt, { source: 'agent.web-research.research' });

    const knowledgeIds: number[] = [];

    const id = await storeKnowledge(
      'web_research',
      query,
      text,
      'web',
      usedRealSearch ? 80 : 65,
      {
        researchedAt: new Date().toISOString(),
        method: usedRealSearch ? 'real_web_search' : 'llm_grounded',
        resultsCount: searchResults.length,
      },
    );
    knowledgeIds.push(id);

    await storage.createSearchHistory({
      query,
      source: usedRealSearch ? 'serper_or_ddg' : 'llm',
      resultSummary: text.substring(0, 500),
      knowledgeExtracted: JSON.stringify(knowledgeIds),
      triggeredBy: 'brain_cycle',
    });

    return { query, findings: text, knowledgeIds, source: usedRealSearch ? 'real_web_search' : 'llm_grounded' };
  } catch (error) {
    console.error(`[WebResearch] Failed to research "${query}":`, error);
    return { query, findings: 'Research failed', knowledgeIds: [], source: 'error' };
  }
}

/**
 * Research latest trends for a specific platform module
 */
export async function researchModuleTrends(module: string): Promise<WebResearchResult> {
  const moduleQueries: Record<string, string> = {
    missions: 'gamification platforms 2026, habit-building apps trends, mission-based learning engagement strategies',
    creator: 'content creation trends 2026, video content best practices, creator economy growth',
    writers: 'creative writing trends 2026, publishing industry changes, AI-assisted writing tools',
    reels: 'short-form video trends 2026, TikTok/Reels algorithm changes, engagement strategies',
    vip: 'SaaS subscription models 2026, premium feature strategies, monetization best practices',
    platform: 'social media platform trends 2026, AI integration in social apps, user engagement strategies',
  };

  const query = moduleQueries[module] || `latest trends in ${module} 2026`;
  return researchTopic(query, `Research for MaraAI ${module} module`);
}

/**
 * Research competitors and similar platforms
 */
export async function researchCompetitors(): Promise<WebResearchResult> {
  return researchTopic(
    'AI-powered social platforms 2026, platforms combining missions + content creation + AI chat, competitor analysis',
    'We need to understand what similar platforms offer and identify gaps we can fill',
  );
}

/**
 * Research a gap — something Mara couldn't answer
 */
export async function researchGap(userQuestion: string, failedContext?: string): Promise<WebResearchResult> {
  const result = await researchTopic(
    userQuestion,
    failedContext ? `Mara tried to answer but didn't have enough info: ${failedContext}` : undefined,
  );

  // Also add to learning queue
  await storage.createLearningTask({
    topic: userQuestion,
    reason: 'User asked something Mara could not answer well',
    priority: 'high',
    source: 'user_gap',
    status: 'completed',
    result: result.findings.substring(0, 1000),
  });

  return result;
}

/**
 * Batch research multiple topics (used during brain cycle)
 */
export async function batchResearch(topics: string[]): Promise<WebResearchResult[]> {
  const results: WebResearchResult[] = [];

  for (const topic of topics.slice(0, 5)) { // Max 5 to avoid API rate limits
    try {
      const result = await researchTopic(topic);
      results.push(result);
    } catch (err) {
      if (err instanceof LLMRateLimitedError) break; // cap hit — no point continuing
      throw err;
    }

    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Generate research topics based on what Mara doesn't know yet
 */
export async function generateResearchAgenda(): Promise<string[]> {
  if (!isLLMConfigured()) return [];

  // Get what Mara already knows
  const existingKnowledge = await storage.getAllKnowledge(50);
  const knownTopics = existingKnowledge.map((k) => k.topic).join(', ');

  const prompt = `Ești ai-ul platformei MaraAI (missions & growth programs, creator studio, writers hub, social reels, VIP).

Ce știi deja: ${knownTopics || 'nimic încă'}

Generează 5 subiecte pe care ar trebui să le cercetezi ACUM pentru a îmbunătăți platforma. 
Focus pe: tendințe actuale, business strategy, user experience, monetizare, tehnologie.

Returnează doar un JSON array de strings: ["topic1", "topic2", ...]`;

  try {
    const text = (
      await llmGenerate(prompt, { source: 'agent.web-research.agenda' })
    ).trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (err) {
    // Propagate rate-limit errors so the brain cycle skips Phase 2 entirely
    // instead of proceeding with the hardcoded fallback list and burning web
    // search quota on calls that will fail anyway.
    if (err instanceof LLMRateLimitedError) throw err;
    return [
      'Gamification and mission-based learning platforms 2026',
      'Content creator monetization strategies',
      'AI chatbot best practices for user retention',
      'Social platform growth hacking strategies',
      'SaaS pricing and subscription optimization',
    ];
  }
}
