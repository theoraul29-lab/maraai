const express = require('express');
const router = express.Router();

// In a real app, use a DB. Here, use a placeholder in-memory store for demo.
const feedbacks = [];

// POST /api/feedback
router.post('/', (req, res) => {
  const { user, message, aiResponse, rating, comment } = req.body;
  if (!message || !aiResponse) return res.status(400).json({ error: 'Message and AI response required' });
  feedbacks.push({
    user,
    message,
    aiResponse,
    rating,
    comment,
    createdAt: new Date(),
  });
  res.json({ success: true });
});

// GET /api/feedback (admin/stats)
router.get('/', (req, res) => {
  res.json({ feedbacks });
});

module.exports = router;
