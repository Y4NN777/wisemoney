import i18n, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";

type Locale = "en" | "fr";

/** The key the language detector used until 2026-10, kept so a stored choice survives. */
const STORAGE_KEY = "i18nextLng";

const LOCALE_LOADERS: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
};

function toLocale(value: string | null | undefined): Locale | null {
  if (value == null) return null;
  const code = value.toLowerCase();
  if (code.startsWith("fr")) return "fr";
  if (code.startsWith("en")) return "en";
  return null;
}

/** The stored choice first, then the first browser language the app speaks, then English. */
function initialLocale(): Locale {
  try {
    const stored = toLocale(localStorage.getItem(STORAGE_KEY));
    if (stored != null) return stored;
  } catch {
    // Storage unavailable: fall through to the browser languages.
  }
  const preferred = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  for (const candidate of preferred) {
    const locale = toLocale(candidate);
    if (locale != null) return locale;
  }
  return "en";
}

/**
 * Each language is its own chunk and only the one in use is downloaded: a first visit on a slow
 * connection does not pay for both (UX audit 2026-10). There is no fallback language for the
 * same reason; the key-parity test in i18n.test.ts guarantees no key is missing from either.
 */
const lazyLocales: BackendModule = {
  type: "backend",
  init() {
    // Nothing to configure: the loaders are static.
  },
  read(language, _namespace, callback) {
    const locale = toLocale(language) ?? "en";
    LOCALE_LOADERS[locale]().then(
      (module) => callback(null, module.default),
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null),
    );
  },
};

/** Resolves once the language in use is loaded; the app renders after it (see main.tsx). */
export const i18nReady: Promise<unknown> = i18n
  .use(lazyLocales)
  .use(initReactI18next)
  .init({
    lng: initialLocale(),
    fallbackLng: false,
    supportedLngs: ["en", "fr"],
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false,
    },
  });

// Every date and number formatter reads document.documentElement.lang; keep it in step with
// i18next itself rather than with a component effect, so a render right after a language
// change never formats with the previous language.
i18n.on("languageChanged", (language) => {
  const locale = toLocale(language) ?? "en";
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
});

export default i18n;
