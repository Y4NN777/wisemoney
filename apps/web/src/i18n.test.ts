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

  it("keeps the dashboard label compact in the bottom navigation", () => {
    expect(fr.nav.dashboardShort).toBe("Accueil");
    expect(fr.nav.dashboardShort.length).toBeLessThan(fr.nav.dashboard.length);
    expect(en.nav.dashboardShort).toBe("Home");
  });

  it("keeps deployment and infrastructure vocabulary out of every user-facing string", () => {
    // ux-simplification decision 6: the product never talks about servers, deployments or its own plumbing.
    const forbidden = [
      /\bPWA\b/i, /\bservers?\b/i, /\bserveurs?\b/i, /d[ée]ploi/i, /deploy/i, /VITE_/, /\bbackend\b/i, /\bproxy\b/i,
      /online service/i, /service en ligne/i, /\bedge\b/i, /managed service/i, /service g[ée]r[ée]/i, /passerelle/i,
      /\bnot configured\b/i, /non configur/i,
    ];
    const offenders: string[] = [];
    for (const [name, resource] of [["en", en], ["fr", fr]] as const) {
      const walk = (value: unknown, path: string) => {
        if (typeof value === "string") {
          const hit = forbidden.find((pattern) => pattern.test(value));
          if (hit != null) offenders.push(`${name}:${path} (${hit.source})`);
        } else if (value != null && typeof value === "object") {
          for (const [key, child] of Object.entries(value)) walk(child, path === "" ? key : `${path}.${key}`);
        }
      };
      walk(resource, "");
    }
    expect(offenders).toEqual([]);
  });
});
