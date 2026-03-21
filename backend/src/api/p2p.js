const express = require('express');
const router = express.Router();

// In-memory P2P message store for demo (replace with DB in production)
const p2pMessages = [];

// POST /api/p2p/message - Send a message to another user
router.post('/message', (req, res) => {
  const { from, to, content } = req.body;
  if (!from || !to || !content) return res.status(400).json({ error: 'from, to, and content required' });
  const msg = { from, to, content, createdAt: new Date() };
  p2pMessages.push(msg);
  res.json({ success: true, message: msg });
});

// GET /api/p2p/messages?user1=alice&user2=bob - Get messages between two users
router.get('/messages', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 required' });
  const messages = p2pMessages.filter(
    (m) =>
      (m.from === user1 && m.to === user2) ||
      (m.from === user2 && m.to === user1),
  );
  res.json({ messages });
});

module.exports = router;
