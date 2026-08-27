import { describe, expect, it } from "vitest";
import { loadThemePreference, resolveTheme, saveThemePreference, THEME_STORAGE_KEY } from "./theme.ts";

function memoryStorage(initial?: string): Storage {
  const values = new Map<string, string>();
  if (initial != null) values.set(THEME_STORAGE_KEY, initial);
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("theme preference", () => {
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", true, "light"],
    ["dark", false, "dark"],
  ] as const)("resolves %s with system dark=%s", (preference, systemDark, expected) => {
    expect(resolveTheme(preference, systemDark)).toBe(expected);
  });

  it("falls back to the system preference for unknown persisted values", () => {
    expect(loadThemePreference(memoryStorage("sepia"))).toBe("system");
  });

  it("persists a valid explicit preference", () => {
    const storage = memoryStorage();
    saveThemePreference("dark", storage);
    expect(loadThemePreference(storage)).toBe("dark");
  });

  it("survives storage access failures", () => {
    const denied = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    expect(loadThemePreference(denied)).toBe("system");
    expect(() => saveThemePreference("light", denied)).not.toThrow();
  });
});
