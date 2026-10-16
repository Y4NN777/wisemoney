import { describe, expect, it } from "vitest";
import bank from "./quickEntry.bank.json";
import { readQuickEntry } from "./quickEntry.ts";

type Expected = { amount: string | null; direction: "expense" | "income" | null; note: string };
type Phrase = { text: string; expected: Expected[]; source: string };

/** Floors from the W1 plan; raise them when the reader improves, never lower them silently. */
const FLOOR = { items: 0.98, amount: 0.98, direction: 0.95, note: 0.9 };

function score(phrases: readonly Phrase[]) {
  const totals = { phrases: phrases.length, items: 0, amount: 0, direction: 0, note: 0, readings: 0 };
  const misses: string[] = [];
  for (const phrase of phrases) {
    const read = readQuickEntry(phrase.text);
    if (read.length === phrase.expected.length) totals.items += 1;
    else misses.push(`${phrase.text} → ${read.length} item(s), expected ${phrase.expected.length}`);
    phrase.expected.forEach((expected, index) => {
      totals.readings += 1;
      const got = read[index];
      if (got?.amount === expected.amount) totals.amount += 1;
      else misses.push(`${phrase.text} → amount ${got?.amount ?? "none"}, expected ${expected.amount}`);
      if (got?.direction === expected.direction) totals.direction += 1;
      else misses.push(`${phrase.text} → direction ${got?.direction ?? "none"}, expected ${expected.direction ?? "none"}`);
      if (got?.note === expected.note) totals.note += 1;
      else misses.push(`${phrase.text} → note "${got?.note ?? ""}", expected "${expected.note}"`);
    });
  }
  return {
    misses,
    rates: {
      items: totals.items / totals.phrases,
      amount: totals.amount / totals.readings,
      direction: totals.direction / totals.readings,
      note: totals.note / totals.readings,
    },
  };
}

describe("quick entry test bank", () => {
  const phrases = bank.phrases as Phrase[];

  it("holds more than 300 phrases", () => {
    expect(phrases.length).toBeGreaterThan(300);
  });

  it("reads every curated phrase exactly", () => {
    const { misses } = score(phrases.filter((phrase) => phrase.source === "curated"));
    expect(misses).toEqual([]);
  });

  it("stays above the floor on the whole bank", () => {
    const { rates, misses } = score(phrases);
    console.info("quick entry bank", JSON.stringify(rates), misses.slice(0, 20));
    expect(rates.items).toBeGreaterThanOrEqual(FLOOR.items);
    expect(rates.amount).toBeGreaterThanOrEqual(FLOOR.amount);
    expect(rates.direction).toBeGreaterThanOrEqual(FLOOR.direction);
    expect(rates.note).toBeGreaterThanOrEqual(FLOOR.note);
  });
});
