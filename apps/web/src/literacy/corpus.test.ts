import { describe, expect, it } from "vitest";
import {
  LITERACY_AREAS,
  LITERACY_PATH,
  LITERACY_SOURCES,
  findRelevantUnits,
  getLiteracyUnit,
  getLiteracyUnits,
  unitAsMarkdown,
} from "./corpus.ts";
import { LITERACY_STARTERS } from "./starters.ts";

const en = getLiteracyUnits("en");
const fr = getLiteracyUnits("fr-BF");
const words = (text: string) => text.replace(/(\d)[\s\xa0\u202f](\d{3})/g, "$1$2").split(/\s+/).filter((word) => /\w/.test(word)).length;
const digits = (text: string) => (text.match(/\d+(?:[\s\xa0\u202f.,]\d+)*/g) ?? []).map((number) => number.replace(/[\s\xa0\u202f.,]/g, "")).sort();

describe("literacy course v1", () => {
  it("has the eight parts in order and the same lessons in both languages", () => {
    expect(LITERACY_AREAS).toEqual(["start", "manage", "save", "bank", "borrow", "protect", "invest", "grow"]);
    const order = LITERACY_AREAS.flatMap((area) => [...LITERACY_PATH[area]]);
    expect(en.map(({ id }) => id)).toEqual(order);
    expect(fr.map(({ id }) => id)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
    expect(order.length).toBeGreaterThanOrEqual(70);
    for (const unit of [...en, ...fr]) expect((LITERACY_PATH[unit.area] as readonly string[]).includes(unit.id), unit.id).toBe(true);
    expect(en.every((unit) => unit.locale === "en") && fr.every((unit) => unit.locale === "fr")).toBe(true);
  });

  it("keeps every lesson complete, short, and tied to registered sources", () => {
    for (const unit of [...en, ...fr]) {
      const where = `${unit.id}.${unit.locale}`;
      expect(unit.points.length, where).toBeGreaterThanOrEqual(3);
      expect(unit.points.length, where).toBeLessThanOrEqual(4);
      for (const text of [unit.title, unit.summary, unit.example, unit.action, unit.watchOut, ...unit.points]) expect(text.trim().length, where).toBeGreaterThan(0);
      expect(unit.aliases.length, where).toBeGreaterThanOrEqual(4);
      expect(unit.sources.length, where).toBeGreaterThan(0);
      for (const source of unit.sources) expect(LITERACY_SOURCES[source]?.name, `${where} -> ${source}`).toBeTruthy();
      expect(words(unitAsMarkdown(unit)), where).toBeLessThan(330);
    }
    for (const [id, source] of Object.entries(LITERACY_SOURCES)) {
      if (source.url != null) expect(source.url, id).toMatch(/^https?:\/\//);
      expect(source.url ?? "", id).not.toMatch(/cnss\.bf|cnssbf\.org|coris-asset\.com/);
    }
  });

  it("keeps the same figures in both languages", () => {
    for (const unit of en) expect(digits(getLiteracyUnit("fr", unit.id)!.example), unit.id).toEqual(digits(unit.example));
  });

  it("never lets the writer\u2019s working language into a lesson", () => {
    const meta = /\b(our sources|the notes|we found|our research|nos sources|les notes|nos recherches)\b/i;
    for (const unit of [...en, ...fr]) expect(unitAsMarkdown(unit), `${unit.id}.${unit.locale}`).not.toMatch(meta);
  });

  it("retrieves the lesson a beginner would expect", () => {
    const top = (question: string, units = en) => findRelevantUnits(units, question).map(({ id }) => id);
    expect(top("how do I make a budget")).toContain("build-a-budget");
    expect(top("what is the maximum interest rate on a loan")).toContain("the-legal-ceiling");
    expect(top("how can I invest on the BRVM from Burkina")).toContain("start-from-burkina");
    expect(top("comment constituer un fonds d\u2019urgence", fr)).toContain("emergency-fund");
    expect(top("c\u2019est quoi une tontine ?", fr).some((id) => id === "savings-groups" || id === "ways-to-save")).toBe(true);
    expect(top("c\u2019est quoi la microfinance", fr)).toContain("what-microfinance-is");
    expect(findRelevantUnits(en, "zzzz qqqq")).toEqual([]);
    expect(findRelevantUnits(en, "what is the")).toEqual([]);
  });

  it("renders a lesson as markdown with the action and locale punctuation", () => {
    expect(unitAsMarkdown(getLiteracyUnit("en", "build-a-budget")!)).toMatch(/\*\*Example:\*\* .+\n\n\*\*Do this week:\*\* .+\n\n\*\*Watch out:\*\* /);
    expect(unitAsMarkdown(getLiteracyUnit("fr", "build-a-budget")!)).toContain("**À faire cette semaine :** ");
  });
});

describe("starter questions", () => {
  it("come from real readers, in both languages, and point at existing lessons", () => {
    expect(LITERACY_STARTERS.length).toBeGreaterThanOrEqual(4);
    for (const starter of LITERACY_STARTERS) {
      expect(starter.question.en.trim().endsWith("?")).toBe(true);
      expect(starter.question.fr.trim().endsWith("?")).toBe(true);
      expect(starter.origin.url).toMatch(/^https:\/\/lefaso\.net\//);
      expect(starter.origin.author.length).toBeGreaterThan(0);
      expect(starter.unitIds.length).toBeGreaterThan(0);
      expect(starter.unitIds.length).toBeLessThanOrEqual(3);
      for (const id of starter.unitIds) expect(getLiteracyUnit("fr", id), `${starter.id} -> ${id}`).not.toBeNull();
    }
  });
});
