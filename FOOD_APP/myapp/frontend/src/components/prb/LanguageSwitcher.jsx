import React from "react";
import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const setLang = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <button
        type="button"
        className={`btn secondary ${i18n.language === "ja" ? "active" : ""}`}
        onClick={() => setLang("ja")}
      >
        日本語
      </button>
      <button
        type="button"
        className={`btn secondary ${i18n.language === "en" ? "active" : ""}`}
        onClick={() => setLang("en")}
      >
        English
      </button>
    </div>
  );
}
