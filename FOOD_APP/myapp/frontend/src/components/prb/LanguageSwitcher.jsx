import React from "react";
import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const setLang = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="language-switcher" aria-label="Language switcher" data-i18n-skip>
      <button
        type="button"
        className={i18n.language?.startsWith("ja") ? "active" : ""}
        onClick={() => setLang("ja")}
      >
        日本語
      </button>
      <button
        type="button"
        className={i18n.language?.startsWith("en") ? "active" : ""}
        onClick={() => setLang("en")}
      >
        English
      </button>
    </div>
  );
}
