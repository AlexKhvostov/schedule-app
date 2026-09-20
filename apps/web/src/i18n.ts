import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

const saved = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
const lng = saved === "en" || saved === "ru" ? saved : "ru";

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setAppLanguage(next: "ru" | "en") {
  localStorage.setItem("lang", next);
  void i18n.changeLanguage(next);
}

export default i18n;
