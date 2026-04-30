import type { Request, Response } from 'express';
import { storage } from '../../../server/storage';
import { getMaraResponse } from '../../../server/ai';
import { checkRateLimit } from '../../../server/rateLimit';

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
