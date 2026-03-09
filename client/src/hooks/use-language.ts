import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import { type Language, type TranslationKey, t as translate } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

export const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  t: (key) => translate(key, "en"),
});

export function useLanguageProvider(): LanguageContextValue {
  const { user } = useAuth();

  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("mara-language");
    return (saved as Language) || "en";
  });

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("mara-language", lang);

    try {
      await fetch("/api/preferences/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
        credentials: "include",
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (user) {
      fetch("/api/preferences", { credentials: "include" })
        .then((res) => {
          if (res.ok) return res.json();
          return null;
        })
        .then((data) => {
          if (data?.language && data.language !== language) {
            setLanguageState(data.language as Language);
            localStorage.setItem("mara-language", data.language);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const t = useCallback(
    (key: TranslationKey) => translate(key, language),
    [language],
  );

  return { language, setLanguage, t };
}

export function useLanguage() {
  return useContext(LanguageContext);
}
