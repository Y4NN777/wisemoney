import { describe, expect, it } from "vitest";
import {
  GREETING_MESSAGE_COUNT,
  getDailyGreetingIndex,
  getGreetingTime,
  getNextGreetingRefreshAt,
} from "./dashboardGreeting.ts";

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
    const morning = getDailyGreetingIndex(new Date(2026, 7, 10, 8), GREETING_MESSAGE_COUNT);
    const evening = getDailyGreetingIndex(new Date(2026, 7, 10, 21), GREETING_MESSAGE_COUNT);
    expect(morning).toBe(evening);
  });

  it("returns a valid index", () => {
    expect(getDailyGreetingIndex(new Date(2026, 7, 10), GREETING_MESSAGE_COUNT)).toBeGreaterThanOrEqual(0);
    expect(getDailyGreetingIndex(new Date(2026, 7, 10), GREETING_MESSAGE_COUNT)).toBeLessThan(GREETING_MESSAGE_COUNT);
  });
});

describe("getNextGreetingRefreshAt", () => {
  it("targets noon during the morning", () => {
    expect(getNextGreetingRefreshAt(new Date(2026, 7, 10, 8, 42))).toEqual(new Date(2026, 7, 10, 12));
  });

  it("targets 18:00 during the afternoon", () => {
    expect(getNextGreetingRefreshAt(new Date(2026, 7, 10, 15, 30))).toEqual(new Date(2026, 7, 10, 18));
  });

  it("targets midnight during the evening", () => {
    expect(getNextGreetingRefreshAt(new Date(2026, 7, 10, 21))).toEqual(new Date(2026, 7, 11));
  });
});
