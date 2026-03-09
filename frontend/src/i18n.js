import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./i18n/en.json";
import ro from "./i18n/ro.json";
import de from "./i18n/de.json";
import ru from "./i18n/ru.json";
import uk from "./i18n/uk.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ro: { translation: ro },
    de: { translation: de },
    ru: { translation: ru },
    uk: { translation: uk },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
