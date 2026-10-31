import { describe, expect, it } from "vitest";
import { QUICK_LINE_COUNT_SHOWN_FROM, quickLineCountThisMonth, recordQuickLineSave } from "./quickLineStats.ts";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
}

const october = new Date(2026, 9, 15);
const november = new Date(2026, 10, 2);

describe("quick line count", () => {
  it("counts saves within a month", () => {
    const storage = memoryStorage();
    expect(quickLineCountThisMonth(storage, october)).toBe(0);
    expect(recordQuickLineSave(storage, october)).toBe(1);
    expect(recordQuickLineSave(storage, october)).toBe(2);
    expect(quickLineCountThisMonth(storage, october)).toBe(2);
  });

  it("starts again when the month changes", () => {
    const storage = memoryStorage();
    recordQuickLineSave(storage, october);
    expect(quickLineCountThisMonth(storage, november)).toBe(0);
    expect(recordQuickLineSave(storage, november)).toBe(1);
  });

  it("treats corrupt or unavailable storage as zero", () => {
    expect(quickLineCountThisMonth(memoryStorage("{not json"), october)).toBe(0);
    expect(quickLineCountThisMonth(memoryStorage(JSON.stringify({ month: "2026-10", count: -4 })), october)).toBe(0);
    const failing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(quickLineCountThisMonth(failing, october)).toBe(0);
    expect(recordQuickLineSave(failing, october)).toBe(1);
  });

  it("shows the count only from the third save", () => {
    expect(QUICK_LINE_COUNT_SHOWN_FROM).toBe(3);
  });
});
