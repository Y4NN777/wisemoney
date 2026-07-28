import { describe, expect, it } from "vitest";
import { formatLocalDateInput, parseLocalDateInput } from "./localDate.ts";

describe("local civil dates", () => {
  it("formats the local calendar date without converting through UTC", () => {
    expect(formatLocalDateInput(new Date(2026, 6, 26, 0, 5))).toBe("2026-07-26");
  });

  it("parses a date at local noon and preserves its calendar components", () => {
    const timestamp = parseLocalDateInput("2026-07-26");
    expect(timestamp).not.toBeNull();
    const date = new Date(timestamp!);
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()]).toEqual([
      2026, 7, 26, 12,
    ]);
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseLocalDateInput("2026-02-29")).toBeNull();
    expect(parseLocalDateInput("07/26/2026")).toBeNull();
  });
});
