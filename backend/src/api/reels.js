const express = require('express');
const router = express.Router();
const ReelsEngine = require('../reels/engine');
const reelsEngine = new ReelsEngine();

// GET /api/reels
router.get('/', async (req, res) => {
  try {
    const reels = await reelsEngine.getAllReels();
    res.json({ reels });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to fetch reels', details: err.message });
  }
});

// POST /api/reels (add a new reel)
router.post('/', async (req, res) => {
  try {
    const result = await reelsEngine.addReel(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add reel', details: err.message });
  }
});

// POST /api/reels/ai (generate an AI reel)
router.post('/ai', async (req, res) => {
  try {
    const aiReel = await reelsEngine.generateAIReel(req.body.prompt);
    res.json(aiReel);
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to generate AI reel', details: err.message });
  }
});

module.exports = router;
