import { describe, expect, it } from "vitest";
import {
  REQUIRED_HELP_FEATURES,
  findRelevantHelpSections,
  getHelpSections,
  normalizeSearchText,
  searchHelpSections,
} from "./corpus.ts";

describe("help corpus", () => {
  it("contains a bilingual section for every important WiseMoney feature", () => {
    for (const locale of ["en", "fr"]) {
      const sections = getHelpSections(locale);
      const covered = new Set(sections.flatMap(({ features }) => features));
      expect(sections.length).toBeGreaterThanOrEqual(20);
      expect(sections.map(({ id }) => id)).toEqual(getHelpSections(locale === "en" ? "fr" : "en").map(({ id }) => id));
      for (const section of sections) {
        expect(section.steps.length, `${locale}/${section.id} has steps`).toBeGreaterThan(0);
        expect(section.expectedResult.length, `${locale}/${section.id} has a result`).toBeGreaterThan(0);
        expect(section.groupId.length).toBeGreaterThan(0);
      }
      for (const feature of REQUIRED_HELP_FEATURES) expect(covered.has(feature), `${locale} is missing ${feature}`).toBe(true);
    }
  });

  it("normalizes accents and case for local search", () => {
    expect(normalizeSearchText("  DÉPENSES et Épargne  ")).toBe("depenses et epargne");
    expect(searchHelpSections(getHelpSections("fr"), "enregistrer dépense")[0]?.id).toBe("transactions");
    expect(searchHelpSections(getHelpSections("fr"), "réinitialiser")[0]?.id).toBe("sauvegarde");
  });

  it("returns the full guide for an empty search and no result for unrelated text", () => {
    const sections = getHelpSections("en");
    expect(searchHelpSections(sections, "")).toEqual(sections);
    expect(searchHelpSections(sections, "astronomy telescope")).toEqual([]);
    expect(searchHelpSections(sections, "backup telescope")).toEqual([]);
  });

  it("explains installation without requiring technical PWA vocabulary", () => {
    for (const locale of ["en", "fr"]) {
      const installation = getHelpSections(locale).find(({ id }) => id === "installation");
      expect(installation).toBeDefined();
      expect([installation?.title, installation?.summary, ...(installation?.steps ?? [])].join(" ")).not.toMatch(/\bPWA\b/i);
      expect([installation?.summary, ...(installation?.steps ?? []), ...(installation?.limitations ?? [])].join(" ")).toMatch(/browser|navigateur/i);
    }
  });

  it("retrieves transfers from a natural question and keeps that context for a follow-up", () => {
    const sections = getHelpSections("fr");
    const first = findRelevantHelpSections(sections, "On peut faire un transfert de compte à compte et le suivre ?");
    expect(first[0]?.id).toBe("virements");

    const followUp = findRelevantHelpSections(sections, "Mais comment le faire exactement ?", 3, first[0] == null ? [] : [first[0].id]);
    expect(followUp[0]?.id).toBe("virements");
  });
});
