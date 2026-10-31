type NameByLanguage = { fr: string; en: string };

/**
 * The CFA francs are the product's home currencies, so their wording is fixed: it never depends on
 * the phone. XAF carries its zone so the two entries stay distinguishable in a picker.
 */
const FIXED_NAMES: Readonly<Record<string, NameByLanguage>> = {
  XOF: { fr: "Francs CFA", en: "CFA francs" },
  XAF: { fr: "Francs CFA (CEMAC)", en: "CFA francs (CEMAC)" },
};

/** Between a currency code and its name, everywhere the two are written together. */
export const CURRENCY_SEPARATOR = " - ";

function capitalize(name: string, locale: string): string {
  return name.length === 0 ? name : name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/**
 * The currency's name in the user's language. A phone without currency names answers with
 * the code itself, which would read "XOF — XOF", so that answer is treated as missing and
 * `fallback` (a known English name, or the code) is used instead.
 */
export function currencyName(code: string, locale: string, fallback: string = code): string {
  const language = locale.toLowerCase().startsWith("fr") ? "fr" : "en";
  const fixed = FIXED_NAMES[code]?.[language];
  if (fixed != null) return fixed;
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
    if (name != null && name.trim() !== "" && name.toUpperCase() !== code) return capitalize(name, locale);
  } catch {
    // An unsupported locale or an older browser: the fallback below applies.
  }
  return fallback;
}

/** "XOF - Francs CFA"; just the code when no name is known. */
export function currencyDisplay(code: string, locale: string, fallback: string = code): string {
  const name = currencyName(code, locale, fallback);
  return name === code ? code : `${code}${CURRENCY_SEPARATOR}${name}`;
}
