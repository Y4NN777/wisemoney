import { describe, expect, it } from "vitest";
import { orderCategoriesForDirection, recentCategoryIds, type CaptureCategory } from "./captureOrdering.ts";

const category = (id: string, name: string, overrides: Partial<CaptureCategory> = {}): CaptureCategory => ({
  id,
  name,
  isSystemDefault: true,
  isArchived: false,
  ...overrides,
});

const defaults: CaptureCategory[] = [
  category("c-salary", "Salary"),
  category("c-freelance", "Freelance"),
  category("c-food", "Food & Dining"),
  category("c-transport", "Transport"),
  category("c-housing", "Housing"),
  category("c-custom", "Side gigs", { isSystemDefault: false }),
];

describe("orderCategoriesForDirection", () => {
  it("hides seeded income categories in expense mode", () => {
    const ordered = orderCategoriesForDirection(defaults, "expense");
    expect(ordered.map((c) => c.name)).toEqual(["Food & Dining", "Housing", "Side gigs", "Transport"]);
  });

  it("keeps everything visible in income mode with income categories first", () => {
    const ordered = orderCategoriesForDirection(defaults, "income");
    expect(ordered.map((c) => c.name)).toEqual(["Freelance", "Salary", "Food & Dining", "Housing", "Side gigs", "Transport"]);
  });

  it("puts recently used categories first", () => {
    const ordered = orderCategoriesForDirection(defaults, "expense", ["c-transport", "c-food"]);
    expect(ordered.map((c) => c.name)).toEqual(["Transport", "Food & Dining", "Housing", "Side gigs"]);
  });

  it("drops archived categories in both modes", () => {
    const archived = [...defaults, category("c-old", "Old", { isArchived: true })];
    expect(orderCategoriesForDirection(archived, "expense").map((c) => c.id)).not.toContain("c-old");
    expect(orderCategoriesForDirection(archived, "income").map((c) => c.id)).not.toContain("c-old");
  });

  it("keeps a user-created category named like an income seed in expense mode", () => {
    const custom = [...defaults, category("c-mine", "Salary", { isSystemDefault: false })];
    const ordered = orderCategoriesForDirection(custom, "expense");
    expect(ordered.map((c) => c.id)).toContain("c-mine");
  });
});

describe("recentCategoryIds", () => {
  it("returns distinct category ids ordered by most recent use", () => {
    const recents = recentCategoryIds([
      { categoryId: "a", accountId: "acc1", timestamp: 100 },
      { categoryId: "b", accountId: "acc1", timestamp: 300 },
      { categoryId: "a", accountId: "acc2", timestamp: 200 },
      { categoryId: null, accountId: "acc1", timestamp: 400 },
      { categoryId: "c", accountId: "acc1", timestamp: 150 },
    ], 3);
    expect(recents).toEqual(["b", "a", "c"]);
  });

  it("caps the list at the limit", () => {
    const recents = recentCategoryIds([
      { categoryId: "a", accountId: "acc1", timestamp: 1 },
      { categoryId: "b", accountId: "acc1", timestamp: 2 },
      { categoryId: "c", accountId: "acc1", timestamp: 3 },
      { categoryId: "d", accountId: "acc1", timestamp: 4 },
    ], 2);
    expect(recents).toEqual(["d", "c"]);
  });
});
