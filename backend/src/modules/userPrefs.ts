import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage';

let deps: { storage: IStorage };

export function injectDeps(d: typeof deps) {
  deps = d;
}

export async function getUserLanguage(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const prefs = await deps.storage.getUserPreferences(userId);
    res.json({ language: prefs?.language || 'en' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get language preference' });
  }
}

export async function setUserLanguage(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const { language } = req.body;
    if (!language || typeof language !== 'string') {
      return res.status(400).json({ message: 'Language code is required' });
    }
    await deps.storage.updateUserLanguage(userId, language);
    res.json({ language });
  } catch (error) {
    res.status(500).json({ message: 'Failed to set language preference' });
  }
}
