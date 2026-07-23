import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./zh.json";
import en from "./en.json";

export const LANGUAGES = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "pst.lang";

function detectInitialLang(): LanguageCode {
  const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language.startsWith("zh") ? "zh" : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: detectInitialLang(),
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

export function setLanguage(code: LanguageCode) {
  localStorage.setItem(STORAGE_KEY, code);
  i18n.changeLanguage(code);
}

export default i18n;
