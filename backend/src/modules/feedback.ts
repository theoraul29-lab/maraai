import type { Request, Response } from 'express';
import { storage } from '../../../server/storage';

export async function moderate(req: Request, res: Response) {
  try {
    const userId = req.user?.claims?.sub || (req.user as any)?.uid;
    const { message, category } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: 'Feedback message is required' });
    }

    const feedback = await storage.createFeedback({
      userId,
      message,
      category: category || 'general',
    });

    res.json({ message: 'Feedback received', feedback });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit feedback' });
  }
}
