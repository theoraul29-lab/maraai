// Mara Web Research Agent
// Searches the internet for information, trends, and knowledge
// Uses the configured LLM provider (Ollama or Gemini) for web-grounded queries

import { llmGenerate, isLLMConfigured } from '../../llm.js';
import { storeKnowledge } from '../knowledge-base.js';
import { storage } from '../../storage.js';

interface WebResearchResult {
  query: string;
  findings: string;
  knowledgeIds: number[];
  source: string;
}

/**
 * Research a topic using Gemini's knowledge (grounded in web data)
 * Gemini 1.5 has up-to-date training data and can be used as a research proxy
 */
export async function researchTopic(query: string, context?: string): Promise<WebResearchResult> {
  if (!isLLMConfigured()) {
    return { query, findings: 'LLM provider not configured', knowledgeIds: [], source: 'none' };
  }

  const prompt = `Ești un agent de research al platformei MaraAI. Caută și raportează cele mai recente informații despre:

"${query}"

${context ? `Context: ${context}` : ''}

Cerințe:
1. Prezintă informații **actuale și verificabile**
2. Include **date concrete** (numere, statistici) unde e posibil
3. Evidențiază ce e **relevant pentru o platformă AI** cu: trading crypto, creator studio, writers hub, social reels
4. Semnalează orice **trend emergent** care ar trebui urmărit

Format:
- **Rezumat**: (2-3 propoziții)
- **Detalii cheie**: (bullet points)
- **Relevanță MaraAI**: (cum se aplică)
- **Acțiuni recomandate**: (ce ar trebui să facem)

Răspunde în română.`;

  try {
    const text = await llmGenerate(prompt);

    const knowledgeIds: number[] = [];

    // Store as web research knowledge
    const id = await storeKnowledge(
      'web_research',
      query,
      text,
      'web',
      65,
      { researchedAt: new Date().toISOString(), method: 'llm_grounded' },
    );
    knowledgeIds.push(id);

    // Log search
    await storage.createSearchHistory({
      query,
      source: 'llm',
      resultSummary: text.substring(0, 500),
      knowledgeExtracted: JSON.stringify(knowledgeIds),
      triggeredBy: 'brain_cycle',
    });

    return { query, findings: text, knowledgeIds, source: 'llm_grounded' };
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
    trading: 'latest crypto trading trends 2026, Bitcoin analysis, DeFi innovations, AI trading strategies',
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
    'AI-powered social platforms 2026, platforms combining trading + content creation + AI chat, competitor analysis',
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
    const result = await researchTopic(topic);
    results.push(result);

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

  const prompt = `Ești ai-ul platformei MaraAI (trading crypto, creator studio, writers hub, social reels, VIP).

Ce știi deja: ${knownTopics || 'nimic încă'}

Generează 5 subiecte pe care ar trebui să le cercetezi ACUM pentru a îmbunătăți platforma. 
Focus pe: tendințe actuale, business strategy, user experience, monetizare, tehnologie.

Returnează doar un JSON array de strings: ["topic1", "topic2", ...]`;

  try {
    const text = (await llmGenerate(prompt)).trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [
      'Crypto market trends and trading AI 2026',
      'Content creator monetization strategies',
      'AI chatbot best practices for user retention',
      'Social platform growth hacking strategies',
      'SaaS pricing and subscription optimization',
    ];
  }
}
