const express = require('express');
const router = express.Router();
const { logEvent } = require('../logger');

router.post('/', (req, res) => {
  logEvent('frontend_error', req.body);
  res.json({ success: true });
});

module.exports = router;
