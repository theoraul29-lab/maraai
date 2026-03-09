import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import { t as translate } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
export const LanguageContext = createContext({
  language: "en",
  setLanguage: () => {},
  t: (key) => translate(key, "en"),
});
export function useLanguageProvider() {
  const { user } = useAuth();
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem("mara-language");
    return saved || "en";
  });
  const setLanguage = useCallback(async (lang) => {
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
            setLanguageState(data.language);
            localStorage.setItem("mara-language", data.language);
          }
        })
        .catch(() => {});
    }
  }, [user]);
  const t = useCallback((key) => translate(key, language), [language]);
  return { language, setLanguage, t };
}
export function useLanguage() {
  return useContext(LanguageContext);
}
