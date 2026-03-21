// Feedback module: handles feedback moderation and posting

const BANNED_WORDS = ['spam', 'scam', 'phishing'];

function moderate(req, res) {
  const { text } = req.body;
  if (!text) return res.status(400).json({ safe: false, message: 'No text provided' });
  const lower = text.toLowerCase();
  const flagged = BANNED_WORDS.filter((w) => lower.includes(w));
  res.json({ safe: flagged.length === 0, flaggedWords: flagged });
}

module.exports = {
  moderate,
};
