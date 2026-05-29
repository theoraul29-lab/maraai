import type { Request, Response } from 'express';
import type { IStorage } from '../../../server/storage.js';

let deps: { storage: IStorage };

export function injectDeps(d: typeof deps) {
  deps = d;
}

const SUPPORTED_LANGUAGES = new Set([
  'en', 'ro', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'uk', 'pl', 'nl', 'cs',
  'hu', 'bg', 'hr', 'sr', 'tr', 'ar', 'hi', 'ja', 'ko', 'zh', 'th', 'vi',
  'sv', 'da', 'el',
]);

function normalizeLanguage(language: unknown): string | null {
  if (typeof language !== 'string' || !language.trim()) return null;
  const base = language.trim().toLowerCase().split(/[-_]/)[0];
  if (!SUPPORTED_LANGUAGES.has(base)) return null;
  return base;
}

export async function getUserLanguage(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const prefs = await deps.storage.getUserPreferences(userId);
    const language = normalizeLanguage(prefs?.language) || 'en';
    res.json({ language });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get language preference' });
  }
}

export async function setUserLanguage(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const normalized = normalizeLanguage(req.body?.language);
    if (!normalized) {
      return res.status(400).json({ message: 'Unsupported language code' });
    }
    await deps.storage.updateUserLanguage(userId, normalized);
    res.json({ language: normalized });
  } catch (error) {
    res.status(500).json({ message: 'Failed to set language preference' });
  }
}

export async function getUserTheme(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const prefs = await deps.storage.getUserPreferences(userId);
    res.json({ theme: prefs?.theme || 'dark' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get theme preference' });
  }
}

export async function setUserTheme(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.uid;
    const { theme } = req.body;
    if (!theme || !['dark', 'light'].includes(theme)) {
      return res.status(400).json({ message: 'Theme must be "dark" or "light"' });
    }
    await deps.storage.updateUserTheme(userId, theme);
    res.json({ theme });
  } catch (error) {
    res.status(500).json({ message: 'Failed to set theme preference' });
  }
}
