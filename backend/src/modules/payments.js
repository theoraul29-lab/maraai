// Payments module: handles payment provider endpoints (Stripe, PayPal)

let stripeProvider, paypalProvider;
function injectDeps(deps) {
  stripeProvider = deps.stripeProvider;
  paypalProvider = deps.paypalProvider;
}

async function processStripePayment(req, res) {
  try {
    const result = await stripeProvider.processPayment(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function processPayPalPayment(req, res) {
  try {
    const result = await paypalProvider.processPayment(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  injectDeps,
  processStripePayment,
  processPayPalPayment,
};
