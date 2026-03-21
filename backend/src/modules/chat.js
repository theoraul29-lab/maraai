// cspell:words prefs userPrefs
// Chat module: handles chat history, sending messages, and chat-related logic
// Modularized from server/routes.ts

let storage; let api; let z; let getMaraResponse; let MOOD_TO_THEME; let
  checkRateLimit;

function injectDeps(deps) {
  storage = deps.storage;
  api = deps.api;
  z = deps.z;
  getMaraResponse = deps.getMaraResponse;
  MOOD_TO_THEME = deps.MOOD_TO_THEME;
  checkRateLimit = deps.checkRateLimit;
}

async function getChatHistory(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    await storage.clearOldMessages(24);
    const messages = await storage.getChatMessages(userId);
    res.json(messages.reverse());
  } catch {
    res.status(500).json({ message: 'Failed to fetch chat history' });
  }
}

async function sendChatMessage(req, res) {
  try {
    const input = api.chat.send.input.parse(req.body);
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const rateLimitCheck = checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        message: 'Too many messages sent. Please try again in a moment.',
        retryAfterMs: rateLimitCheck.retryAfterMs,
      });
    }

    const userMsg = await storage.createChatMessage({
      content: input.message,
      sender: 'user',
      userId,
    });

    const history = await storage.getChatMessages(userId);
    const conversationHistory = history.slice(-20).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    const prefs = await storage.getUserPreferences(userId);
    const userPrefs = {
      ...(prefs || {}),
      language: input.language || prefs?.language,
    };

    const { response: aiResponseContent, detectedMood } = await getMaraResponse(
      input.message,
      conversationHistory,
      userPrefs,
      input.module,
    );

    const aiMsg = await storage.createChatMessage({
      content: aiResponseContent,
      sender: 'ai',
      userId,
    });

    const suggestedTheme = MOOD_TO_THEME[detectedMood] || 'midnight';

    storage
      .updateUserPreferences(userId, {
        lastMood: detectedMood,
        lastActive: new Date().toISOString(),
      })
      .catch(() => {});

    res.status(200).json({
      message: userMsg,
      aiResponse: aiMsg,
      mood: detectedMood,
      suggestedTheme,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join('.'),
      });
    }
    res.status(500).json({ message: 'Failed to process chat message' });
  }
}

module.exports = {
  injectDeps,
  getChatHistory,
  sendChatMessage,
};
