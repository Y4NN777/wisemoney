import { describe, expect, it } from "vitest";
import type { InAppReminder } from "../reminders/index.ts";
import { hasNewDueReminder } from "./feedback.ts";

function reminder(overrides: Partial<InAppReminder> & Pick<InAppReminder, "id">): InAppReminder {
  return {
    type: "weekly_review",
    entityId: "weekly",
    label: "Review",
    occurrenceKey: "weekly:1",
    dueAt: 1,
    triggerAt: 1,
    leadDays: 0,
    budgetThreshold: null,
    readAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

describe("notification feedback", () => {
  it("detects a genuinely new unread reminder", () => {
    expect(hasNewDueReminder(new Set(["known"]), [reminder({ id: "known" }), reminder({ id: "new" })])).toBe(true);
  });

  it("does not signal already known, read, or dismissed reminders", () => {
    expect(hasNewDueReminder(new Set(["known"]), [
      reminder({ id: "known" }),
      reminder({ id: "read", readAt: 2 }),
      reminder({ id: "dismissed", dismissedAt: 2 }),
    ])).toBe(false);
  });
});
