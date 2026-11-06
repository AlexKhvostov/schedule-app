import i18n from "../i18n";
import ru from "./locales/ru.json";
import en from "./locales/en.json";

// Loaded with the lazy Dashboard entry, never with the initial schedule bundle.
i18n.addResourceBundle("ru", "analytics", ru, true, true);
i18n.addResourceBundle("en", "analytics", en, true, true);

export { Dashboard } from "./Dashboard";
