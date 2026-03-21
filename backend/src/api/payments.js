const express = require('express');
const router = express.Router();

const { StripeProvider, PayPalProvider } = require('../payments/providers');
const stripe = new StripeProvider();
const paypal = new PayPalProvider();

router.post('/stripe', async (req, res) => {
  try {
    const result = await stripe.processPayment(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/paypal', async (req, res) => {
  try {
    const result = await paypal.processPayment(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
