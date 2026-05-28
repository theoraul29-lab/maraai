import type { Request, Response } from 'express';
import { storage } from '../../../server/storage.js';
import { route as routeAi } from '../../../server/maraai/ai-router.js';
import { checkRateLimit } from '../../../server/rateLimit.js';
import { isLaunched } from '../../../server/modules/launch-countdown.js';
import { callAgent, isSupportAgentEnabled } from '../../../server/lib/anthropic-agents.js';
import { getUserXP } from '../../../server/missions/engine.js';
import { rawSqlite } from '../../../server/db.js';

const PRE_LAUNCH_MSG_LIMIT = 20;

export async function getChatHistory(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const messages = await storage.getChatMessages(userId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get chat history' });
  }
}

export async function sendChatMessage(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const { message, module, language } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: 'Message is required' });
    }

    const rateLimitCheck = checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        message: 'Too many messages. Please try again in a moment.',
        retryAfterMs: rateLimitCheck.retryAfterMs,
      });
    }

    // Pre-launch: 20 messages per user per 24h. After 01.07.2026 normal tiers apply.
    if (!isLaunched()) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const history = await storage.getChatMessages(userId);
      const sentLast24h = history.filter(
        (m) => m.sender === 'user' && m.createdAt >= cutoff,
      ).length;
      if (sentLast24h >= PRE_LAUNCH_MSG_LIMIT) {
        return res.status(429).json({
          code: 'pre_launch_limit',
          message:
            'Ai atins limita de 20 de mesaje pe zi. Revino mâine pentru alte 20 de mesaje gratuite. ' +
            'Din 1 iulie 2026 accesul devine nelimitat cu abonamentul tău.',
          launchDate: '2026-07-01',
          messagesUsed: sentLast24h,
          messagesLimit: PRE_LAUNCH_MSG_LIMIT,
          resetsAt: new Date(cutoff.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    // Save user message
    const userMsg = await storage.createChatMessage({
      content: message,
      sender: 'user',
      userId,
    });

    // Get chat history for context
    const history = await storage.getChatMessages(userId);
    const formattedHistory = history
      .slice(-20)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.content }));

    // Get user prefs for personality
    const prefs = await storage.getUserPreferences(userId);

    // Route through Mara Support agent if configured, otherwise use hybrid router.
    let response: string;
    let detectedMood = 'calm';
    let route = 'central';
    let fallback = false;
    let latencyMs = 0;

    if (isSupportAgentEnabled()) {
      const t0 = Date.now();
      try {
        const xp = getUserXP(userId);
        const activeMissions = (rawSqlite.prepare(
          `SELECT m.title, m.pillar, um.status FROM user_missions um
           JOIN missions m ON m.id = um.mission_id
           WHERE um.user_id = ? AND um.status = 'active' LIMIT 5`
        ).all(userId) as Array<{ title: string; pillar: string; status: string }>);
        const enrollment = (rawSqlite.prepare(
          `SELECT p.name, pe.current_day, pe.status FROM program_enrollments pe
           JOIN programs p ON p.id = pe.program_id
           WHERE pe.user_id = ? AND pe.status = 'active' LIMIT 1`
        ).get(userId) as { name: string; current_day: number; status: string } | undefined);

        const userCtx = `<user_context>
${JSON.stringify({
  xp: xp.xp,
  level: xp.level,
  streak: xp.streak,
  language: language || prefs?.language || 'ro',
  activeMissions: activeMissions.map(m => m.title),
  enrolledProgram: enrollment ? `${enrollment.name} (day ${enrollment.current_day})` : null,
}, null, 2)}
</user_context>`;

        const agentMessages = [
          ...formattedHistory.slice(-10).map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user' as const, content: message },
        ];

        response = await callAgent(
          process.env.MARA_SUPPORT_AGENT_ID!,
          agentMessages,
          { systemExtra: userCtx },
        );
        route = 'agent';
      } catch (agentErr) {
        console.warn('[chat] Mara Support agent failed, falling back to router:', agentErr);
        const result = await routeAi(message, {
          userId, module,
          prefs: prefs ? { personality: prefs.personality, language: language || prefs.language } : { language },
          history: formattedHistory,
        });
        response = result.response;
        detectedMood = result.detectedMood;
        route = result.route;
        fallback = true;
      }
      latencyMs = Date.now() - t0;
    } else {
      const result = await routeAi(message, {
        userId,
        module,
        prefs: prefs
          ? { personality: prefs.personality, language: language || prefs.language }
          : { language },
        history: formattedHistory,
      });
      response = result.response;
      detectedMood = result.detectedMood;
      route = result.route;
      fallback = result.fallback;
      latencyMs = result.latencyMs;
    }

    // Save AI response
    const aiMsg = await storage.createChatMessage({
      content: response,
      sender: 'mara',
      userId,
    });

    res.json({ message: userMsg, aiResponse: aiMsg, detectedMood, route, fallback, latencyMs });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send message' });
  }
}
