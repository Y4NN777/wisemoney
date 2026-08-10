import { describe, expect, it } from "vitest";
import { getDailyGreetingIndex, getGreetingTime } from "./dashboardGreeting.ts";

describe("getGreetingTime", () => {
  it("uses morning before noon", () => {
    expect(getGreetingTime(new Date(2026, 7, 10, 11, 59))).toBe("morning");
  });

  it("uses afternoon from noon until 18:00", () => {
    expect(getGreetingTime(new Date(2026, 7, 10, 12))).toBe("afternoon");
    expect(getGreetingTime(new Date(2026, 7, 10, 17, 59))).toBe("afternoon");
  });

  it("uses evening from 18:00", () => {
    expect(getGreetingTime(new Date(2026, 7, 10, 18))).toBe("evening");
  });
});

describe("getDailyGreetingIndex", () => {
  it("keeps the same message throughout a local calendar day", () => {
    const morning = getDailyGreetingIndex(new Date(2026, 7, 10, 8), 5);
    const evening = getDailyGreetingIndex(new Date(2026, 7, 10, 21), 5);
    expect(morning).toBe(evening);
  });

  it("returns a valid index", () => {
    expect(getDailyGreetingIndex(new Date(2026, 7, 10), 5)).toBeGreaterThanOrEqual(0);
    expect(getDailyGreetingIndex(new Date(2026, 7, 10), 5)).toBeLessThan(5);
  });
});
