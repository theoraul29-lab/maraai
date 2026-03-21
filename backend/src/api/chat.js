const express = require('express');
const router = express.Router();

const AIEngine = require('../ai/engine');
const ai = new AIEngine(process.env.OPENAI_API_KEY);

// POST /api/chat
router.post('/', async (req, res) => {
  const { message, history, lang } = req.body;
  try {
    const aiResponse = await ai.chat({ message, history, lang });
    res.json({ response: aiResponse });
  } catch (err) {
    res.status(500).json({ error: 'AI error', details: err.message });
  }
});

module.exports = router;
