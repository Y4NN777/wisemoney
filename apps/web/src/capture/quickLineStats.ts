/**
 * How many movements this month were saved from the quick line, kept on the device only. It is a
 * convenience counter, not security state (like the consent flags, ADR-0008): losing it only resets
 * the number. It counts what really happened and estimates nothing.
 */
const STORAGE_KEY = "wisemoney.quickLine.v1";

type Stored = { month: string; count: number };
type CounterStorage = Pick<Storage, "getItem" | "setItem">;

export function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function read(storage: CounterStorage, now: Date): Stored {
  const fresh = { month: monthKey(now), count: 0 };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw == null) return fresh;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (parsed.month !== fresh.month || typeof parsed.count !== "number" || !Number.isFinite(parsed.count) || parsed.count < 0) return fresh;
    return { month: parsed.month, count: Math.floor(parsed.count) };
  } catch {
    return fresh;
  }
}

export function quickLineCountThisMonth(storage: CounterStorage = localStorage, now: Date = new Date()): number {
  try {
    return read(storage, now).count;
  } catch {
    return 0;
  }
}

/** Adds one saved movement to this month's count and returns the new count. */
export function recordQuickLineSave(storage: CounterStorage = localStorage, now: Date = new Date()): number {
  const next = { ...read(storage, now) };
  next.count += 1;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota): the count simply is not kept.
  }
  return next.count;
}

/** The count is shown from this many saves, so a first or second use is not turned into a statistic. */
export const QUICK_LINE_COUNT_SHOWN_FROM = 3;
