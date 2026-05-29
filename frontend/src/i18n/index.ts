import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ro from './locales/ro.json';

const resources = {
  en: { translation: en },
  ro: { translation: ro },
};

// Lazy-loaded languages (loaded on demand)
const lazyLanguages = [
  'es', 'fr', 'de', 'it', 'pt', 'ru', 'uk', 'pl', 'nl', 'cs',
  'hu', 'bg', 'hr', 'sr', 'tr', 'ar', 'hi', 'ja', 'ko', 'zh',
  'th', 'vi', 'sv', 'da', 'el',
];

// RTL languages
export const RTL_LANGUAGES = ['ar'];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ro', name: 'Română', flag: '🇷🇴' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺' },
  { code: 'bg', name: 'Български', flag: '🇧🇬' },
  { code: 'hr', name: 'Hrvatski', flag: '🇭🇷' },
  { code: 'sr', name: 'Srpski', flag: '🇷🇸' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰' },
  { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
];

const SUPPORTED_LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map(l => l.code));

export function normalizeLanguageCode(lang: string | null | undefined): string {
  if (!lang || typeof lang !== 'string') return 'en';
  const normalized = lang.trim().toLowerCase();
  const base = normalized.split(/[-_]/)[0];
  if (SUPPORTED_LANGUAGE_CODES.has(base)) return base;
  if (SUPPORTED_LANGUAGE_CODES.has(normalized)) return normalized;
  return 'en';
}

// localStorage key for the user's chosen language. Single source of
// truth; legacy keys are read on first boot below for backward
// compatibility, then migrated.
export const LANG_STORAGE_KEY = 'mara_lang';
const LEGACY_LANG_KEYS = ['mara_language', 'i18nextLng'];

/** One-time legacy key migration: copy old keys to LANG_STORAGE_KEY. */
function migrateLegacyLanguageKey(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    if (localStorage.getItem(LANG_STORAGE_KEY)) {
      return localStorage.getItem(LANG_STORAGE_KEY);
    }
    for (const k of LEGACY_LANG_KEYS) {
      const v = localStorage.getItem(k);
      if (v) {
        localStorage.setItem(LANG_STORAGE_KEY, v);
        return v;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Lazy-load a language translation file on demand.
 * Returns true on success, false if the JSON file is missing.
 */
export async function loadLanguage(lang: string): Promise<boolean> {
  const code = normalizeLanguageCode(lang);
  if (i18n.hasResourceBundle(code, 'translation')) return true;
  try {
    const module = await import(`./locales/${code}.json`);
    i18n.addResourceBundle(code, 'translation', module.default, true, true);
    return true;
  } catch {
    console.warn(`[i18n] Translation for "${code}" not found, falling back to English.`);
    return false;
  }
}

/**
 * Change language with lazy loading and HTML dir/lang update.
 * Persists the choice to localStorage. Server sync (for logged-in users)
 * is handled separately by `useLanguage` in `./useLanguage.ts`.
 */
export async function changeLanguage(lang: string): Promise<void> {
  const code = normalizeLanguageCode(lang);
  await loadLanguage(code);
  await i18n.changeLanguage(code);
  // Update HTML attributes so RTL languages render correctly.
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr';
  // Persist choice (single source of truth).
  try {
    localStorage.setItem(LANG_STORAGE_KEY, code);
  } catch {
    // Storage quota / privacy mode — ignore.
  }
}

const initialLang = migrateLegacyLanguageKey();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ro', ...lazyLanguages],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ['localStorage'],
    },
    // Per spec §2.3: missing keys must log a warning and fall back to
    // English ONLY for the missing key — the rest of the UI keeps the
    // user-selected language.
    saveMissing: false,
    // When the call site provides a default value (e.g.
    // `t('you.timeline', 'Timeline')`) we MUST honour it instead of
    // returning the raw key — otherwise users see e.g. "you.timeline"
    // in the UI as soon as a key is missing from the locale files.
    // The previous handler returned the key unconditionally, which
    // caused production (`hellomara.net`) to render raw i18n keys for
    // every You-profile tab and label.
    returnEmptyString: false,
    parseMissingKeyHandler: (key, defaultValue) => {
      if (typeof window !== 'undefined') {
        console.warn(`[i18n] Missing translation key: "${key}" — falling back to English.`);
      }
      if (typeof defaultValue === 'string' && defaultValue.length > 0 && defaultValue !== key) {
        return defaultValue;
      }
      return key;
    },
  });

// Set initial dir/lang on HTML element.
const savedLang = normalizeLanguageCode(initialLang || i18n.language || 'en');
document.documentElement.lang = savedLang;
document.documentElement.dir = RTL_LANGUAGES.includes(savedLang) ? 'rtl' : 'ltr';

// Boot-time lazy load: i18n only bundles `en` and `ro` eagerly.
// If the user previously saved a lazy language (e.g. 'fr'), the
// LanguageDetector will have restored `i18n.language = 'fr'` but
// the bundle isn't loaded yet, so every t() call falls back to English.
// We expose `langReady` so main.tsx can await it before mounting React,
// preventing any flash of English content on the first render.
export const langReady: Promise<void> = (savedLang && lazyLanguages.includes(savedLang))
  ? loadLanguage(savedLang).then(loaded => {
      if (loaded) void i18n.changeLanguage(savedLang);
    })
  : Promise.resolve();

export default i18n;
