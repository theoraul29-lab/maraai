import type { Request, Response } from 'express';

let deps: { stripeProvider: any; paypalProvider: any };

export function injectDeps(d: typeof deps) {
  deps = d;
}

export async function processStripePayment(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const { amount, currency, paymentMethodId } = req.body;

    if (!amount || !paymentMethodId) {
      return res.status(400).json({ message: 'Amount and payment method are required' });
    }

    const result = await deps.stripeProvider.processPayment({
      userId,
      amount,
      currency: currency || 'EUR',
      paymentMethodId,
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Stripe payment failed' });
  }
}

export async function processPayPalPayment(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const { amount, currency, orderId } = req.body;

    if (!amount || !orderId) {
      return res.status(400).json({ message: 'Amount and order ID are required' });
    }

    const result = await deps.paypalProvider.processPayment({
      userId,
      amount,
      currency: currency || 'EUR',
      orderId,
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'PayPal payment failed' });
  }
}
