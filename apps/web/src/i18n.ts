import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "fr"],
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "navigator", "htmlTag", "cookie"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

// Every date and number formatter reads document.documentElement.lang; keep it in step with
// i18next itself rather than with a component effect, so a render right after a language
// change never formats with the previous language.
i18n.on("languageChanged", (language) => {
  if (typeof document !== "undefined") document.documentElement.lang = language.startsWith("fr") ? "fr" : "en";
});
if (typeof document !== "undefined" && i18n.resolvedLanguage != null) {
  document.documentElement.lang = i18n.resolvedLanguage.startsWith("fr") ? "fr" : "en";
}

export default i18n;
