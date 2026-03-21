const express = require('express');
const router = express.Router();
const { Configuration, OpenAIApi } = require('openai');

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

// VoiceAI endpoint with OpenAI integration
router.post('/', async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'Transcript required' });
  try {
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful voice assistant.' },
        { role: 'user', content: transcript },
      ],
      ...(req.query.lang ? { user: req.query.lang } : {}),
    });
    const aiResponse = completion.data.choices[0]?.message?.content || '';
    res.json({ response: aiResponse });
  } catch (err) {
    const { logEvent } = require('../logger');
    logEvent('AI_ERROR', {
      error: err.message,
      stack: err.stack,
      context: 'voiceai',
      transcript,
    });
    res.status(500).json({ error: 'AI error', details: err.message });
  }
});

module.exports = router;
