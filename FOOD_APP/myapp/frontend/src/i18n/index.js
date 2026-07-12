// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import jaCommon from "../locales/ja/common.json";
import enCommon from "../locales/en/common.json";

const STORAGE_KEY = "app:lang";

function detectLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "ja" || saved === "en") return saved;
  return "ja";
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: { common: jaCommon },
      en: { common: enCommon },
    },
    lng: detectLang(),
    fallbackLng: "ja",
    defaultNS: "common",
    ns: ["common"],
    interpolation: { escapeValue: false },
    returnNull: false,
  });

document.documentElement.lang = i18n.language;

// 言語変更時に保存
i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  } catch {}
});

export default i18n;
