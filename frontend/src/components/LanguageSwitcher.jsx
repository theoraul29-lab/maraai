import React from "react";
import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const languages = [
    { code: "en", label: "EN" },
    { code: "ro", label: "RO" },
    { code: "de", label: "DE" },
    { code: "ru", label: "RU" },
    { code: "uk", label: "UK" },
  ];
  return (
    <div className="mb-4">
      <label className="mr-2 font-semibold">{t("language")}:</label>
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="p-2 border rounded"
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
