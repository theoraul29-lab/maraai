import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';
import type { z as ZodType } from 'zod';

let deps: { storage: IStorage; z: typeof ZodType };

export function injectDeps(d: typeof deps) {
  deps = d;
}

export async function getPremiumStatus(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const isPremium = await deps.storage.getUserPremiumStatus(userId);
    const orders = await deps.storage.getPremiumOrders(userId);
    res.json({ isPremium, orders });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get premium status' });
  }
}

export async function getTradingAccess(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const access = await deps.storage.getUserTradingAccess(userId);
    res.json(access);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get trading access' });
  }
}

export async function createPremiumOrder(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const { amount, currency, orderType, subscriptionPeriod, transferReference, notes } = req.body;

    if (!amount || !orderType) {
      return res.status(400).json({ message: 'Amount and order type are required' });
    }

    const order = await deps.storage.createPremiumOrder({
      userId,
      amount: String(amount),
      currency: currency || 'EUR',
      orderType,
      subscriptionPeriod: subscriptionPeriod || 'once',
      transferReference: transferReference || null,
      notes: notes || null,
    });

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create order' });
  }
}
