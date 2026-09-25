import { describe, expect, it } from "vitest";
import { parseOperationsSearch } from "./operations.tsx";

describe("parseOperationsSearch", () => {
  it("keeps supported, non-sensitive operation filters", () => {
    expect(parseOperationsSearch({ q: "rent", kind: "expense", accountId: "a", categoryId: "c", start: "10", end: 20 })).toEqual({
      q: "rent", kind: "expense", accountId: "a", categoryId: "c", start: 10, end: 20,
    });
  });

  it("drops unknown kinds and reversed ranges", () => {
    expect(parseOperationsSearch({ kind: "unknown", start: 20, end: 10 })).toEqual({ start: 20 });
  });

  it("keeps a preset only when no explicit range is given", () => {
    expect(parseOperationsSearch({ preset: "week" })).toEqual({ preset: "week" });
    expect(parseOperationsSearch({ preset: "week", start: 10 })).toEqual({ start: 10 });
    expect(parseOperationsSearch({ preset: "year" })).toEqual({});
  });
});
