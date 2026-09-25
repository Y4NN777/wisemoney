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

  it("keeps primary screens free of prose and chrome labels short", () => {
    // Copy rule (ux-simplification decision 8, 2026-09-25): titles carry primary screens; explanations live in Help.
    const words = (value: string | undefined) => (value ?? "").trim().split(/\s+/).filter(Boolean).length;
    for (const resource of [en, fr]) {
      const r = resource as Record<string, Record<string, unknown>>;
      expect(r.settings!.description).toBeUndefined();
      expect(r.operations!.description).toBeUndefined();
      expect((r.keyUnlock!.setup as Record<string, unknown>).description).toBeUndefined();
      expect((r.dashboard!.greeting as Record<string, unknown>).messages).toBeUndefined();
      for (const section of Object.values(r.settings!.sections as Record<string, Record<string, string>>)) {
        expect(section.description).toBeUndefined();
        expect(words(section.title)).toBeLessThanOrEqual(4);
      }
      for (const group of ["nav", "planning.links", "capture.tabs"]) {
        const node = group.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], resource) as Record<string, string>;
        for (const [key, value] of Object.entries(node)) {
          if (key.endsWith("Aria")) continue;
          expect(words(value), `${group}.${key}`).toBeLessThanOrEqual(6);
        }
      }
      for (const step of ["firstMovement", "accounts", "plan"]) {
        const node = (r.firstSteps as Record<string, Record<string, string>>)[step]!;
        expect(words(node.label), `firstSteps.${step}.label`).toBeLessThanOrEqual(7);
        expect(words(node.action), `firstSteps.${step}.action`).toBeLessThanOrEqual(3);
      }
    }
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
