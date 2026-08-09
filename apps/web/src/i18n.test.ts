import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix.length === 0 ? key : `${prefix}.${key}`)
  );
}

function leafValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value == null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value).flatMap(leafValues);
}

describe("localization resources", () => {
  it("keeps English and French translation keys in parity", () => {
    expect(leafKeys(fr).sort()).toEqual(leafKeys(en).sort());
  });

  it("does not ship blank French translations", () => {
    expect(leafValues(fr).every((value) => value.trim().length > 0)).toBe(true);
  });
});
