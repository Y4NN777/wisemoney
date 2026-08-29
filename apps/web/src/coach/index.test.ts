import { describe, expect, it } from "vitest";
import {
  DEFAULT_COACH_SETTINGS, canScheduleCoachNotification, decideCoachNudge, pauseAfterDismissals,
  recordCoachEvent, recordCoachFormFault, resetCoachHistory, type LocalCoachContext,
} from "./index.ts";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function context(patch: Partial<LocalCoachContext> = {}): LocalCoachContext {
  return {
    locale: "fr", surfaceId: "dashboard", sessionStartedAt: NOW - 21_000, sessionNudgeShown: false,
    interactionBusy: false, wiseBotOpen: false, accountCount: 1, hasTransaction: true, hasTransfer: true,
    planningUsed: true, remindersEnabled: true, hasDatedItems: false, backupCreated: true,
    repeatedFaultCode: null, repeatedTaskId: null, ...patch,
  };
}

describe("WiseBot coach decisions", () => {
  it("waits twenty seconds and never interrupts busy input", () => {
    const history = resetCoachHistory(NOW - DAY);
    expect(decideCoachNudge(context({ sessionStartedAt: NOW - 19_999 }), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ reason: "too-early" });
    expect(decideCoachNudge(context({ interactionBusy: true }), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ reason: "busy" });
  });

  it("prioritises recovery, then first account and first transaction", () => {
    const history = resetCoachHistory(NOW - DAY);
    expect(decideCoachNudge(context({ repeatedFaultCode: "storage_unavailable" }), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ nudge: { id: "recovery-storage_unavailable" } });
    expect(decideCoachNudge(context({ repeatedTaskId: "virements" }), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ nudge: { taskId: "virements", kind: "recovery" } });
    expect(decideCoachNudge(context({ accountCount: 0 }), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ nudge: { id: "first-account" } });
    expect(decideCoachNudge(context({ hasTransaction: false }), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ nudge: { id: "first-transaction" } });
  });

  it("detects the same generic form fault twice within ten minutes", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(recordCoachFormFault("capture.transfer.amount", "virements", storage, NOW)).toBe(false);
    expect(recordCoachFormFault("capture.transfer.amount", "virements", storage, NOW + 1_000)).toBe(true);
    const stored = JSON.parse([...values.values()][0] ?? "[]") as Array<Record<string, unknown>>;
    expect(Object.keys(stored[0] ?? {}).sort()).toEqual(["at", "faultId", "taskId"]);
  });

  it("enforces one per session, two per week, and per-tip cooldowns", () => {
    let history = resetCoachHistory(NOW - 40 * DAY);
    expect(decideCoachNudge(context({ sessionNudgeShown: true }), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ reason: "session-limit" });
    history = recordCoachEvent(history, "one", "shown", NOW - DAY);
    history = recordCoachEvent(history, "two", "shown", NOW - 2 * DAY);
    expect(decideCoachNudge(context(), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ reason: "weekly-limit" });
    history = resetCoachHistory(NOW - 40 * DAY);
    history = recordCoachEvent(history, "first-account", "dismissed", NOW - DAY);
    expect(decideCoachNudge(context({ accountCount: 0 }), DEFAULT_COACH_SETTINGS, history, NOW)).toMatchObject({ reason: "cooldown" });
  });

  it("pauses fourteen days after three consecutive dismissals", () => {
    let history = resetCoachHistory(NOW - DAY);
    history = recordCoachEvent(history, "a", "dismissed", NOW - 3000);
    history = recordCoachEvent(history, "b", "dismissed", NOW - 2000);
    history = recordCoachEvent(history, "c", "dismissed", NOW - 1000);
    const settings = pauseAfterDismissals(DEFAULT_COACH_SETTINGS, history, NOW);
    expect(settings.pausedUntil).toBe(NOW + 14 * DAY);
    expect(decideCoachNudge(context(), settings, history, NOW)).toMatchObject({ reason: "paused" });
  });

  it("allows at most one coach notification per week", () => {
    let history = resetCoachHistory(NOW - DAY);
    const settings = { ...DEFAULT_COACH_SETTINGS, notificationsEnabled: true };
    expect(canScheduleCoachNotification(settings, history, NOW)).toBe(true);
    history = recordCoachEvent(history, "tip", "notification_delivered", NOW);
    expect(canScheduleCoachNotification(settings, history, NOW + 6 * DAY)).toBe(false);
    expect(canScheduleCoachNotification(settings, history, NOW + 7 * DAY)).toBe(true);
  });
});
