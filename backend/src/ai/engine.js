const { Configuration, OpenAIApi } = require('openai');

class AIEngine {
  constructor(apiKey) {
    this.openai = new OpenAIApi(new Configuration({ apiKey }));
  }

  async chat({ message, history = [], lang }) {
    if (!message) throw new Error('Message required');
    try {
      const completion = await this.openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          ...(Array.isArray(history) ? history : []),
          { role: 'user', content: message },
        ],
        ...(lang ? { user: lang } : {}),
      });
      return completion.data.choices[0]?.message?.content || '';
    } catch (err) {
      const { logEvent } = require('../logger');
      logEvent('AI_ERROR', {
        error: err.message,
        stack: err.stack,
        context: 'engine',
        message,
        history,
        lang,
      });
      throw err;
    }
  }
}

module.exports = AIEngine;
