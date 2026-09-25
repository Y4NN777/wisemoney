/** Date presets shared by Activity (and any surface that offers "today / 7 days / this month / all"). */
export type ActivityPreset = "day" | "week" | "month" | "all";

export const ACTIVITY_PRESETS: readonly ActivityPreset[] = ["day", "week", "month", "all"];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isActivityPreset(value: unknown): value is ActivityPreset {
  return typeof value === "string" && (ACTIVITY_PRESETS as readonly string[]).includes(value);
}

/** Bounds for a preset relative to `now`; "month" runs from the 1st of the current month to `now`. */
export function getActivityPresetBounds(preset: ActivityPreset, now: number): { start: number; end: number } {
  const date = new Date(now);
  switch (preset) {
    case "day":
      return { start: new Date(now).setHours(0, 0, 0, 0), end: now };
    case "week":
      return { start: now - WEEK_MS, end: now };
    case "month":
      return { start: new Date(date.getFullYear(), date.getMonth(), 1).getTime(), end: now };
    case "all":
      return { start: 0, end: now };
  }
}
