import { describe, expect, it } from "vitest";
import { getHelpSections } from "./corpus.ts";
import { suggestedTasks } from "./suggestions.ts";

describe("suggestedTasks", () => {
  const tasks = getHelpSections("en");

  it("puts the current surface first and fills to the limit without repeats", () => {
    const result = suggestedTasks(tasks, "budgets");
    expect(result).toHaveLength(3);
    expect(result[0]!.surfaces).toContain("budgets");
    expect(new Set(result.map((task) => task.id)).size).toBe(3);
  });

  it("falls back to corpus order without a surface", () => {
    expect(suggestedTasks(tasks, undefined).map((task) => task.id)).toEqual(tasks.slice(0, 3).map((task) => task.id));
  });

  it("works for both locales", () => {
    expect(suggestedTasks(getHelpSections("fr"), "dashboard")).toHaveLength(3);
  });
});
