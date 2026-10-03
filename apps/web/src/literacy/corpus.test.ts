import { describe, expect, it } from "vitest";
import {
  LITERACY_AREAS,
  LITERACY_SOURCES,
  findRelevantUnits,
  getLiteracyUnit,
  getLiteracyUnits,
  unitAsMarkdown,
} from "./corpus.ts";
import { LITERACY_STARTERS } from "./starters.ts";

const en = getLiteracyUnits("en");
const fr = getLiteracyUnits("fr-BF");

describe("literacy corpus v0", () => {
  it("ships the same 32 units, in the same order and areas, in both languages", () => {
    expect(en).toHaveLength(32);
    expect(fr.map(({ id, area }) => `${area}/${id}`)).toEqual(en.map(({ id, area }) => `${area}/${id}`));
    expect(new Set(en.map(({ id }) => id)).size).toBe(32);
    expect(en.every((unit) => unit.locale === "en") && fr.every((unit) => unit.locale === "fr")).toBe(true);
  });

  it("covers every area and keeps units complete and short", () => {
    for (const area of LITERACY_AREAS) expect(en.some((unit) => unit.area === area)).toBe(true);
    for (const unit of [...en, ...fr]) {
      expect(unit.points.length).toBeGreaterThanOrEqual(3);
      expect(unit.points.length).toBeLessThanOrEqual(4);
      expect(unit.aliases.length).toBeGreaterThan(0);
      expect(unit.sources.length).toBeGreaterThan(0);
      for (const source of unit.sources) expect(LITERACY_SOURCES[source]).toBeTruthy();
      for (const text of [unit.title, unit.summary, unit.example, unit.watchOut, ...unit.points]) expect(text.trim().length).toBeGreaterThan(0);
      expect(unitAsMarkdown(unit).split(/\s+/).length).toBeLessThan(260);
    }
  });

  it("keeps the same figures in both languages", () => {
    const digits = (text: string) => (text.match(/\d[\d\s.,]*\d|\d/g) ?? []).map((number) => number.replace(/[\s.,]/g, "")).sort();
    for (const unit of en) {
      const other = getLiteracyUnit("fr", unit.id)!;
      expect(digits(other.example), unit.id).toEqual(digits(unit.example));
    }
  });

  it("retrieves the lesson a young user would expect", () => {
    const top = (question: string, units = en) => findRelevantUnits(units, question)[0]?.id;
    expect(top("Is sports betting a good way to make money?")).toBe("betting");
    expect(top("how does compound interest work")).toBe("compound-interest");
    expect(top("someone on telegram says i can double my money")).toBe("scams-ponzi");
    expect(top("should I buy bitcoin")).toBe("crypto-forex");
    expect(top("my family keeps asking me for money")).toBe("family-support");
    expect(top("c’est quoi une tontine ?", fr)).toBe("where-to-save");
    expect(top("comment sortir du surendettement", fr)).toBe("out-of-debt");
    expect(top("prêt rapide sur une appli de prêt", fr)).toBe("digital-loans");
  });

  it("returns nothing when no lesson matches or the question has no content", () => {
    expect(findRelevantUnits(en, "zzzz qqqq")).toEqual([]);
    expect(findRelevantUnits(en, "what is the")).toEqual([]);
    expect(findRelevantUnits(en, "budget loan savings insurance").length).toBeLessThanOrEqual(3);
  });

  it("renders a unit as markdown with locale punctuation", () => {
    expect(unitAsMarkdown(getLiteracyUnit("en", "betting")!)).toContain("**Example:** 1,000 F a day");
    expect(unitAsMarkdown(getLiteracyUnit("fr", "betting")!)).toContain("**Exemple :** 1 000 F de paris par jour");
  });
});

describe("beginner starter questions", () => {
  it("are phrased as questions in both languages and point at existing lessons", () => {
    expect(LITERACY_STARTERS.length).toBeGreaterThanOrEqual(3);
    for (const starter of LITERACY_STARTERS) {
      expect(starter.question.en.trim().endsWith("?")).toBe(true);
      expect(starter.question.fr.trim().endsWith("?")).toBe(true);
      expect(starter.unitIds.length).toBeGreaterThan(0);
      expect(starter.unitIds.length).toBeLessThanOrEqual(3);
      for (const id of starter.unitIds) {
        expect(getLiteracyUnit("en", id), `${starter.id} -> ${id}`).not.toBeNull();
        expect(getLiteracyUnit("fr", id), `${starter.id} -> ${id}`).not.toBeNull();
      }
    }
  });

  it("never use a lesson title as the question", () => {
    const titles = new Set([...en, ...fr].map((unit) => unit.title));
    for (const starter of LITERACY_STARTERS) {
      expect(titles.has(starter.question.en)).toBe(false);
      expect(titles.has(starter.question.fr)).toBe(false);
    }
  });
});
