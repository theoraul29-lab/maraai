export interface PaymentRequest {
  userId: string;
  amount: number;
  currency: string;
  paymentMethodId?: string;
  orderId?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  message: string;
}

export class StripeProvider {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return {
        success: false,
        message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in environment.',
      };
    }

    try {
      // Dynamic import to avoid crash when stripe is not installed
      const stripe = (await import('stripe')).default;
      const client = new stripe(stripeKey);

      const paymentIntent = await client.paymentIntents.create({
        amount: Math.round(request.amount * 100),
        currency: request.currency.toLowerCase(),
        payment_method: request.paymentMethodId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: { userId: request.userId },
      });

      return {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        message: paymentIntent.status === 'succeeded' ? 'Payment successful' : `Payment status: ${paymentIntent.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Stripe payment failed',
      };
    }
  }
}

export class PayPalProvider {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return {
        success: false,
        message: 'PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.',
      };
    }

    try {
      const baseUrl = process.env.PAYPAL_SANDBOX === 'true'
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

      // Get access token
      const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
      });
      const authData = await authResponse.json() as any;

      // Capture the order
      const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${request.orderId}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.access_token}`,
        },
      });
      const captureData = await captureResponse.json() as any;

      return {
        success: captureData.status === 'COMPLETED',
        transactionId: captureData.id,
        message: captureData.status === 'COMPLETED' ? 'Payment successful' : `Payment status: ${captureData.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'PayPal payment failed',
      };
    }
  }
}
