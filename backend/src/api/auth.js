const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// In a real app, use a DB. Here, use a placeholder in-memory store for demo.
const users = [];

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (users.find((u) => u.email === email)) return res.status(409).json({ error: 'User already exists' });
  const hash = await bcrypt.hash(password, 10);
  users.push({ email, password: hash });
  res.json({ success: true });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  // In production, issue JWT or session
  res.json({ success: true });
});

module.exports = router;
