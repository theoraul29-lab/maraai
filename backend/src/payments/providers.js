class PaymentProvider {
  async processPayment(data) {
    throw new Error('processPayment not implemented');
  }
}

class StripeProvider extends PaymentProvider {
  async processPayment(data) {
    // Integrate with Stripe API here
    return { success: true, message: 'Stripe payment processed (stub)' };
  }
}

class PayPalProvider extends PaymentProvider {
  async processPayment(data) {
    // Integrate with PayPal API here
    return { success: true, message: 'PayPal payment processed (stub)' };
  }
}

module.exports = {
  StripeProvider,
  PayPalProvider,
};
