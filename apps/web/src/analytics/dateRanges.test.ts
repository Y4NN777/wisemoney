import { describe, expect, it } from "vitest";
import { ACTIVITY_PRESETS, getActivityPresetBounds, isActivityPreset } from "./dateRanges.ts";

describe("activity presets", () => {
  const now = new Date(2026, 8, 24, 15, 30).getTime();

  it("bounds day, month and all relative to now", () => {
    expect(getActivityPresetBounds("day", now)).toEqual({ start: new Date(2026, 8, 24).getTime(), end: now });
    expect(getActivityPresetBounds("month", now)).toEqual({ start: new Date(2026, 8, 1).getTime(), end: now });
    expect(getActivityPresetBounds("all", now)).toEqual({ start: 0, end: now });
  });

  it("keeps the week window inside the last seven days", () => {
    const week = getActivityPresetBounds("week", now);
    expect(week.end).toBe(now);
    expect(now - week.start).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("recognises only the four presets", () => {
    for (const preset of ACTIVITY_PRESETS) expect(isActivityPreset(preset)).toBe(true);
    expect(isActivityPreset("year")).toBe(false);
    expect(isActivityPreset(undefined)).toBe(false);
  });
});
