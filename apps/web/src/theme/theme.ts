export const THEME_STORAGE_KEY = "wisemoney.theme.preference.v1";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}
export function loadThemePreference(storage: ThemeStorage | null): ThemePreference {
  if (storage == null) return "system";
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function saveThemePreference(preference: ThemePreference, storage: ThemeStorage | null): void {
  if (storage == null) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // A private browser context can deny storage. The in-memory choice still applies.
  }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}
