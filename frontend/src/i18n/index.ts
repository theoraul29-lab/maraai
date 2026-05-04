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
  if (i18n.hasResourceBundle(lang, 'translation')) return true;
  try {
    const module = await import(`./locales/${lang}.json`);
    i18n.addResourceBundle(lang, 'translation', module.default, true, true);
    return true;
  } catch {
    console.warn(`[i18n] Translation for "${lang}" not found, falling back to English.`);
    return false;
  }
}

/**
 * Change language with lazy loading and HTML dir/lang update.
 * Persists the choice to localStorage. Server sync (for logged-in users)
 * is handled separately by `useLanguage` in `./useLanguage.ts`.
 */
export async function changeLanguage(lang: string): Promise<void> {
  await loadLanguage(lang);
  await i18n.changeLanguage(lang);
  // Update HTML attributes so RTL languages render correctly.
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
  // Persist choice (single source of truth).
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
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
        // eslint-disable-next-line no-console
        console.warn(`[i18n] Missing translation key: "${key}" — falling back to English.`);
      }
      if (typeof defaultValue === 'string' && defaultValue.length > 0 && defaultValue !== key) {
        return defaultValue;
      }
      return key;
    },
  });

// Set initial dir/lang on HTML element.
const savedLang = initialLang || i18n.language || 'en';
document.documentElement.lang = savedLang;
document.documentElement.dir = RTL_LANGUAGES.includes(savedLang) ? 'rtl' : 'ltr';

export default i18n;
