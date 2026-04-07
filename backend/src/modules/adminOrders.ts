import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';

let deps: { storage: IStorage };

export function injectDeps(d: typeof deps) {
  deps = d;
}

export async function getOrders(_req: Request, res: Response) {
  try {
    const orders = await deps.storage.getPremiumOrders();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get orders' });
  }
}

export async function confirmOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await deps.storage.confirmPremiumOrder(orderId);
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Failed to confirm order' });
  }
}

export async function rejectOrder(req: Request, res: Response) {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await deps.storage.rejectPremiumOrder(orderId);
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject order' });
  }
}
