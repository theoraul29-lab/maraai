const express = require("express");
const router = express.Router();

// Admin stats endpoint stub
router.get("/stats", (req, res) => {
  // Example stats (replace with real DB queries in production)
  res.json({
    users: 1234,
    messages: 5678,
    payments: 42,
    reels: 99,
  });
});

module.exports = router;
