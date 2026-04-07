// Mara Platform Analyzer Agent
// Analyzes the platform's health, generates insights, and proposes improvements

import { GoogleGenerativeAI } from '@google/generative-ai';
import { storeKnowledge, getKnowledgeStats } from '../knowledge-base.js';
import { storage } from '../../storage.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface PlatformHealth {
  totalUsers: number;
  totalMessages: number;
  totalLikes: number;
  totalVideos: number;
  totalWriterPages: number;
  recentFeedback: string[];
  moduleActivity: Record<string, number>;
}

/**
 * Collect platform health metrics
 */
export async function collectPlatformMetrics(): Promise<PlatformHealth> {
  const [users, messages, likesCount, allVideos, pages, feedback] = await Promise.all([
    storage.getAllUsers(),
    storage.getTotalMessageCount(),
    storage.getTotalLikeCount(),
    storage.getVideos(),
    storage.getPublishedWriterPages(),
    storage.getRecentFeedback(20),
  ]);

  // Count videos by type for module activity
  const moduleActivity: Record<string, number> = {};
  for (const video of allVideos) {
    moduleActivity[video.type] = (moduleActivity[video.type] || 0) + 1;
  }
  moduleActivity['writers'] = pages.length;
  moduleActivity['chat'] = messages;

  return {
    totalUsers: users.length,
    totalMessages: messages,
    totalLikes: likesCount,
    totalVideos: allVideos.length,
    totalWriterPages: pages.length,
    recentFeedback: feedback.map((f) => `[${f.category}] ${f.message}`),
    moduleActivity,
  };
}

/**
 * Analyze platform and generate improvement insights
 */
export async function analyzePlatform(): Promise<{
  insights: string[];
  proposals: Array<{
    module: string;
    title: string;
    description: string;
    priority: string;
    impact: string;
  }>;
}> {
  const metrics = await collectPlatformMetrics();
  const knowledgeStats = await getKnowledgeStats();

  if (!process.env.GEMINI_API_KEY) {
    return { insights: ['Gemini API key not configured'], proposals: [] };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Ești Mara, AI-ul platformei MaraAI. Analizează aceste metrici și generează insights + propuneri de îmbunătățire:

## Metrici Platformă
- Total useri: ${metrics.totalUsers}
- Total mesaje chat: ${metrics.totalMessages}
- Total likes: ${metrics.totalLikes}
- Total videouri: ${metrics.totalVideos}
- Total pagini writers: ${metrics.totalWriterPages}
- Activitate per modul: ${JSON.stringify(metrics.moduleActivity)}

## Feedback Recent
${metrics.recentFeedback.length > 0 ? metrics.recentFeedback.join('\n') : 'Niciun feedback încă'}

## Knowledge Stats
${JSON.stringify(knowledgeStats)}

## Module Disponibile
trading, creator, writers, reels, vip, chat, general

Returnează JSON:
{
  "insights": ["insight1", "insight2", ...],
  "proposals": [
    {
      "module": "trading|creator|writers|reels|vip|chat|general",
      "title": "titlu propunere",
      "description": "descriere detaliată",
      "priority": "P0|P1|P2|P3",
      "impact": "low|medium|high|critical"
    }
  ]
}

Generează MINIM 3 insights și 3 propuneri concrete. Fii specific și acționabil.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { insights: ['Could not parse analysis'], proposals: [] };

    const parsed = JSON.parse(jsonMatch[0]);

    // Save proposals to database
    for (const proposal of parsed.proposals || []) {
      await storage.createPlatformInsight({
        module: proposal.module,
        insightType: 'improvement',
        title: proposal.title,
        description: proposal.description,
        priority: proposal.priority,
        estimatedImpact: proposal.impact,
        source: 'self_analysis',
      });
    }

    // Store insights as knowledge
    for (const insight of parsed.insights || []) {
      await storeKnowledge(
        'platform_insight',
        'Platform Analysis',
        insight,
        'self_reflection',
        75,
        { analysisDate: new Date().toISOString() },
      );
    }

    return parsed;
  } catch (error) {
    console.error('[PlatformAnalyzer] Analysis failed:', error);
    return { insights: ['Analysis failed'], proposals: [] };
  }
}

/**
 * Generate growth suggestions based on current state
 */
export async function generateGrowthSuggestions(): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY) return [];

  const metrics = await collectPlatformMetrics();
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Platformă MaraAI:
- ${metrics.totalUsers} useri, ${metrics.totalMessages} mesaje, ${metrics.totalVideos} videouri, ${metrics.totalWriterPages} pagini
- Activitate: ${JSON.stringify(metrics.moduleActivity)}

Generează 5 sugestii concrete de growth. Răspunde ca JSON array: ["sugestie1", ...]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

/**
 * Analyze what modules need the most attention
 */
export async function identifyWeakModules(): Promise<{ module: string; issue: string; suggestion: string }[]> {
  const metrics = await collectPlatformMetrics();

  const weakModules: { module: string; issue: string; suggestion: string }[] = [];

  // Check for modules with zero activity
  const expectedModules = ['trading', 'creator', 'writers', 'reels'];
  for (const mod of expectedModules) {
    const activity = metrics.moduleActivity[mod] || 0;
    if (activity === 0) {
      weakModules.push({
        module: mod,
        issue: 'Zero activity detected',
        suggestion: `Module "${mod}" has no content yet. Consider seeding it with initial content or promoting it to users.`,
      });
    }
  }

  // Check chat engagement
  if (metrics.totalMessages < 10) {
    weakModules.push({
      module: 'chat',
      issue: 'Low chat engagement',
      suggestion: 'Consider adding conversation starters, onboarding flow, or proactive Mara messages.',
    });
  }

  return weakModules;
}
