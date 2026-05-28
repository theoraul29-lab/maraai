import type { Request, Response } from 'express';
import { storage } from '../../../server/storage.js';
import { route as routeAi } from '../../../server/maraai/ai-router.js';
import { checkRateLimit } from '../../../server/rateLimit.js';
import { isLaunched } from '../../../server/modules/launch-countdown.js';

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

    // Pre-launch: every user gets 20 free Mara messages. After 01.07.2026
    // the normal subscription tiers take over.
    if (!isLaunched()) {
      const history = await storage.getChatMessages(userId);
      const sentCount = history.filter((m) => m.sender === 'user').length;
      if (sentCount >= PRE_LAUNCH_MSG_LIMIT) {
        return res.status(429).json({
          code: 'pre_launch_limit',
          message:
            'Ai folosit cele 20 de mesaje gratuite din perioada de pre-lansare. ' +
            'Platforma se lansează pe 1 iulie 2026 — revino atunci pentru acces nelimitat cu abonamentul tău.',
          launchDate: '2026-07-01',
          messagesUsed: sentCount,
          messagesLimit: PRE_LAUNCH_MSG_LIMIT,
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

    // Get Mara response via the hybrid AI router (local → central → p2p).
    // Behavior is identical to the previous direct getMaraResponse call when
    // the user is in centralized mode (the default).
    const { response, detectedMood, route, fallback, latencyMs } = await routeAi(message, {
      userId,
      module,
      prefs: prefs
        ? { personality: prefs.personality, language: language || prefs.language }
        : { language },
      history: formattedHistory,
    });

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
