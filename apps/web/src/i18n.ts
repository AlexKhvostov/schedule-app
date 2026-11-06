import i18n, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";

const saved = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
const lng = saved === "en" || saved === "ru" ? saved : "ru";

// Keep the growing secondary dictionary out of the entry bundle. i18next loads
// and caches it through its normal language/fallback flow before rendering.
const bundledLanguages: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    if (language === "en") void import("./locales/en.json").then((module) => callback(null, module.default), (error: Error) => callback(error, false));
    else callback(null, ru);
  },
};

void i18n.use(bundledLanguages).use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
  },
  partialBundledLanguages: true,
  supportedLngs: ["ru", "en"],
  lng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setAppLanguage(next: "ru" | "en") {
  localStorage.setItem("lang", next);
  void i18n.changeLanguage(next);
}

export default i18n;
