/**
 * Unified language hook — the single API the rest of the app should use
 * to read or change the active language.
 *
 * Spec compliance (§2.4–2.6):
 *   • localStorage key `mara_lang` is the persistence layer (handled by
 *     i18next + `LANG_STORAGE_KEY` in `./index.ts`).
 *   • For logged-in users, the server-stored language wins on app load
 *     and `setLanguage` POSTs back to `/api/user/language` so the choice
 *     follows the user across devices.
 *   • Anonymous users only persist locally; the server endpoint is
 *     `requireAuth`-gated and we silently skip the network call.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage as changeI18nLanguage, SUPPORTED_LANGUAGES } from './index';

export type LanguageCode = string;

export interface LanguageMeta {
  code: string;
  name: string;
  flag: string;
}

export interface UseLanguageReturn {
  language: LanguageCode;
  available: LanguageMeta[];
  setLanguage: (code: LanguageCode, opts?: { skipServerSync?: boolean }) => Promise<void>;
}

async function syncLanguageToServer(code: string): Promise<void> {
  try {
    // Best-effort POST. If the user is anonymous, the server returns 401
    // and we silently swallow it — the client-side localStorage is still
    // updated by changeI18nLanguage.
    await fetch('/api/user/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ language: code }),
    });
  } catch (err) {
    // Network failure should never block a language switch in the UI.
    console.warn('[i18n] failed to sync language to server:', err);
  }
}

export function useLanguage(): UseLanguageReturn {
  const { i18n } = useTranslation();

  const setLanguage = useCallback(
    async (code: LanguageCode, opts?: { skipServerSync?: boolean }) => {
      await changeI18nLanguage(code);
      if (!opts?.skipServerSync) {
        // Fire-and-forget: don't await network on the UI path.
        void syncLanguageToServer(code);
      }
    },
    [],
  );

  return {
    language: i18n.language || 'en',
    available: SUPPORTED_LANGUAGES,
    setLanguage,
  };
}
