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

/**
 * Lazy-load a language translation file on demand
 */
export async function loadLanguage(lang: string): Promise<boolean> {
  if (i18n.hasResourceBundle(lang, 'translation')) return true;
  try {
    const module = await import(`./locales/${lang}.json`);
    i18n.addResourceBundle(lang, 'translation', module.default, true, true);
    return true;
  } catch {
    console.warn(`Translation for "${lang}" not found, falling back to English.`);
    return false;
  }
}

/**
 * Change language with lazy loading and HTML dir/lang update
 */
export async function changeLanguage(lang: string): Promise<void> {
  await loadLanguage(lang);
  await i18n.changeLanguage(lang);
  // Update HTML attributes
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
  // Persist choice
  localStorage.setItem('mara_language', lang);
}

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
      lookupLocalStorage: 'mara_language',
      caches: ['localStorage'],
    },
  });

// Set initial dir/lang on HTML element
const savedLang = localStorage.getItem('mara_language') || i18n.language || 'en';
document.documentElement.lang = savedLang;
document.documentElement.dir = RTL_LANGUAGES.includes(savedLang) ? 'rtl' : 'ltr';

export default i18n;
