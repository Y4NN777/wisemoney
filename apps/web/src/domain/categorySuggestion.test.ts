import { describe, expect, it } from "vitest";
import { noteKey, suggestCategory, type SuggestionHistoryItem } from "./categorySuggestion.ts";

const usable = new Set(["transport", "food", "travel", "salary"]);
const spent = (note: string, categoryId: string | null, timestamp: number): SuggestionHistoryItem => ({ note, categoryId, direction: "expense", timestamp });

describe("category suggestion from history", () => {
  it("ignores case, accents, amounts and filler words in notes", () => {
    expect(noteKey("Taxi  2000 F")).toBe("taxi");
    expect(noteKey("le Tô de la maison")).toBe("to maison");
  });

  it("suggests the category most often chosen for the same note", () => {
    const history = [spent("taxi", "transport", 1), spent("Taxi", "transport", 2), spent("taxi", "travel", 3)];
    expect(suggestCategory("taxi 500", "expense", history, usable)).toEqual({ categoryId: "transport", basis: "same", uses: 2 });
  });

  it("breaks a tie with the most recent use", () => {
    const history = [spent("taxi", "transport", 1), spent("taxi", "travel", 5)];
    expect(suggestCategory("taxi", "expense", history, usable)?.categoryId).toBe("travel");
  });

  it("falls back to notes starting with the same word", () => {
    const history = [spent("taxi moto", "transport", 1)];
    expect(suggestCategory("taxi", "expense", history, usable)).toEqual({ categoryId: "transport", basis: "firstWord", uses: 1 });
  });

  it("suggests nothing without history, for the other direction, or for an archived category", () => {
    expect(suggestCategory("taxi", "expense", [], usable)).toBeNull();
    expect(suggestCategory("taxi", "income", [spent("taxi", "transport", 1)], usable)).toBeNull();
    expect(suggestCategory("taxi", "expense", [spent("taxi", "old", 1)], usable)).toBeNull();
    expect(suggestCategory("", "expense", [spent("taxi", "transport", 1)], usable)).toBeNull();
  });
});
