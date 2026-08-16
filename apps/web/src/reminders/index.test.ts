import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import type { LocalReminder, ReminderQueueStorage } from "@/pwa/reminderQueue.ts";
import {
  DEFAULT_REMINDER_SETTINGS,
  computeReminderQueue,
  dismissReminder,
  loadReminderInbox,
  loadReminderSettings,
  markReminderRead,
  rebuildReminderQueue,
  saveReminderSettings,
  type ReminderSettings,
} from "./index.ts";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  readonly values = new Map<string, string>();
  readonly writes: Array<{ key: string; value: string }> = [];

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
    this.writes.push({ key, value });
  }
}

function systemQueue(
  replacement?: ReturnType<typeof vi.fn<(reminders: readonly LocalReminder[]) => Promise<void>>>,
) {
  const replaceAll = replacement ?? vi.fn<(reminders: readonly LocalReminder[]) => Promise<void>>()
    .mockResolvedValue(undefined);
  return {
    storage: {
      enqueue: vi.fn(),
      replaceAll,
      remove: vi.fn(),
      claimDue: vi.fn(),
      complete: vi.fn(),
      release: vi.fn(),
      prune: vi.fn(),
    } as unknown as ReminderQueueStorage,
    replaceAll,
  };
}

function enabledSettings(): ReminderSettings {
  return {
    ...DEFAULT_REMINDER_SETTINGS,
    enabled: true,
    types: Object.fromEntries(Object.entries(DEFAULT_REMINDER_SETTINGS.types).map(([type, value]) => [
      type,
      { ...value, leadDays: [...value.leadDays] },
    ])) as ReminderSettings["types"],
    weeklyReview: { ...DEFAULT_REMINDER_SETTINGS.weeklyReview },
    budgetThresholds: [...DEFAULT_REMINDER_SETTINGS.budgetThresholds],
  };
}

function snapshot(overrides: Partial<FinancialStateSnapshot> = {}): FinancialStateSnapshot {
  return {
    version: 4,
    asOfEventId: "event-1",
    asOfTimestamp: new Date(2026, 7, 15, 12).getTime(),
    baseCurrency: "XOF",
    currencyContextId: "XOF",
    missingFxCurrencies: [],
    accounts: [],
    categories: [],
    budgets: [],
    goals: [],
    recurringItems: [],
    debtCredits: [],
    transfers: [],
    plannedExpenses: [],
    periodStart: new Date(2026, 7, 1).getTime(),
    periodEnd: new Date(2026, 8, 0, 23, 59, 59, 999).getTime(),
    totalBalance: { minorUnits: 0, currency: "XOF" },
    periodIncome: { minorUnits: 0, currency: "XOF" },
    periodExpenses: { minorUnits: 0, currency: "XOF" },
    netCashFlow: { minorUnits: 0, currency: "XOF" },
    categoryTotals: {},
    budgetProgress: {},
    goalProgress: {},
    projectedRecurring: [],
    ...overrides,
  };
}

const now = new Date(2026, 7, 15, 12).getTime();
const inDays = (days: number) => new Date(2026, 7, 15 + days, 12).getTime();

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("reminder settings", () => {
  it("requires explicit global opt-in while enabling each type by default", () => {
    const settings = loadReminderSettings(new MemoryStorage());

    expect(settings.enabled).toBe(false);
    expect(Object.values(settings.types).every((entry) => entry.enabled)).toBe(true);
    expect(settings.types.planned_expense.leadDays).toEqual([7, 3, 0]);
    expect(settings.budgetThresholds).toEqual([70, 90, 100]);
  });

  it("persists and normalises per-type configuration", () => {
    const storage = new MemoryStorage();
    const settings = enabledSettings();
    settings.types.planned_expense = { enabled: false, leadDays: [0, 7, 3, 7] };

    const saved = saveReminderSettings(settings, storage);

    expect(saved.types.planned_expense).toEqual({ enabled: false, leadDays: [7, 3, 0] });
    expect(loadReminderSettings(storage)).toEqual(saved);
  });

  it("falls back safely when persisted settings are corrupt", () => {
    const storage = new MemoryStorage();
    storage.setItem("wisemoney:reminders:settings:v1", "not-json");
    expect(loadReminderSettings(storage)).toEqual(DEFAULT_REMINDER_SETTINGS);
  });
});

describe("computeReminderQueue", () => {
  it("returns no reminder before global consent", () => {
    const state = snapshot({
      plannedExpenses: [{
        id: "planned-1",
        label: "Insurance",
        estimatedAmount: { minorUnits: 10_000, currency: "XOF" },
        categoryId: "category-1",
        priority: "high",
        dueDate: inDays(2),
        note: "private note",
        status: "pending",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
        transactionId: null,
        completedAccountId: null,
        actualAmount: null,
      }],
    });

    expect(computeReminderQueue(state, DEFAULT_REMINDER_SETTINGS, now)).toEqual([]);
  });

  it("keeps only the most urgent missed stage and retains future stages", () => {
    const state = snapshot({
      plannedExpenses: [{
        id: "planned-1",
        label: "Insurance",
        estimatedAmount: { minorUnits: 10_000, currency: "XOF" },
        categoryId: "category-1",
        priority: "high",
        dueDate: inDays(2),
        note: "private note",
        status: "pending",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
        transactionId: null,
        completedAccountId: null,
        actualAmount: null,
      }],
    });
    const settings = enabledSettings();
    settings.types.weekly_review.enabled = false;

    const reminders = computeReminderQueue(state, settings, now);

    expect(reminders.map((reminder) => reminder.leadDays)).toEqual([3, 0]);
    expect(reminders.every((reminder) => reminder.label === "Insurance")).toBe(true);
    expect(reminders.map((reminder) => reminder.id)).toEqual(
      computeReminderQueue(state, settings, now).map((reminder) => reminder.id),
    );
  });

  it("collapses J-7, J-3 and J to J for an overdue occurrence", () => {
    const state = snapshot({
      plannedExpenses: [{
        id: "planned-overdue",
        label: "Overdue",
        estimatedAmount: { minorUnits: 1, currency: "XOF" },
        categoryId: "category-1",
        priority: "low",
        dueDate: inDays(-2),
        note: "",
        status: "pending",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
        transactionId: null,
        completedAccountId: null,
        actualAmount: null,
      }],
    });
    const settings = enabledSettings();
    settings.types.weekly_review.enabled = false;

    expect(computeReminderQueue(state, settings, now)).toMatchObject([{ leadDays: 0 }]);
  });

  it("schedules the next weekly review rather than an already missed one", () => {
    const settings = enabledSettings();
    for (const [type, value] of Object.entries(settings.types)) {
      value.enabled = type === "weekly_review";
    }

    const [review] = computeReminderQueue(snapshot(), settings, now);
    expect(review?.type).toBe("weekly_review");
    expect(review?.triggerAt).toBeGreaterThan(now);
  });

  it("keeps a recurring occurrence due earlier today available for its J reminder", () => {
    const settings = enabledSettings();
    for (const [type, value] of Object.entries(settings.types)) {
      value.enabled = type === "recurring_item";
    }
    settings.types.recurring_item.leadDays = [0];
    const dueEarlierToday = new Date(2026, 7, 15, 0).getTime();
    const state = snapshot({
      recurringItems: [{
        id: "daily-check",
        categoryId: "category-1",
        label: "Monthly check",
        amount: { minorUnits: 1, currency: "XOF" },
        direction: "expense",
        frequency: "monthly",
        startDate: dueEarlierToday,
        lastRealised: null,
        isArchived: false,
      }],
    });

    expect(computeReminderQueue(state, settings, now)).toMatchObject([{
      entityId: "daily-check",
      dueAt: dueEarlierToday,
      leadDays: 0,
    }]);
  });

  it("projects weekly review, active recurring items, highest budget threshold and due debts", () => {
    const debtWithDueDate = {
      id: "debt-1",
      kind: "debt" as const,
      partyName: "Bank",
      motive: "Loan",
      amount: { minorUnits: 50_000, currency: "XOF" },
      date: now,
      dueDate: inDays(3),
      status: "pending" as const,
    };
    const receivableWithoutDueDate = {
      id: "receivable-1",
      kind: "receivable" as const,
      partyName: "Friend",
      motive: "Advance",
      amount: { minorUnits: 5_000, currency: "XOF" },
      date: now,
      dueDate: null,
      status: "pending" as const,
    };
    const state = snapshot({
      recurringItems: [{
        id: "recurring-1",
        categoryId: "category-1",
        label: "Rent",
        amount: { minorUnits: 30_000, currency: "XOF" },
        direction: "expense",
        frequency: "monthly",
        startDate: new Date(2026, 6, 20, 12).getTime(),
        lastRealised: null,
        isArchived: false,
      }],
      budgets: [{
        id: "budget-1",
        name: "Food",
        categoryId: "category-1",
        limit: { minorUnits: 100_000, currency: "XOF" },
        periodMonth: "2026-08",
        isArchived: false,
        spent: { minorUnits: 95_000, currency: "XOF" },
      }],
      budgetProgress: {
        "budget-1": {
          limit: { minorUnits: 100_000, currency: "XOF" },
          spent: { minorUnits: 95_000, currency: "XOF" },
          percentage: 95,
        },
      },
      debtCredits: [debtWithDueDate, receivableWithoutDueDate],
    });

    const reminders = computeReminderQueue(state, enabledSettings(), now);

    expect(reminders.some((reminder) => reminder.type === "weekly_review")).toBe(true);
    expect(reminders.some((reminder) =>
      reminder.type === "recurring_item" && reminder.label === "Rent"
    )).toBe(true);
    expect(reminders.filter((reminder) => reminder.type === "budget_threshold"))
      .toMatchObject([{ label: "Food", budgetThreshold: 90 }]);
    expect(reminders.some((reminder) =>
      reminder.type === "debt_due" && reminder.label === "Bank"
    )).toBe(true);
    expect(reminders.some((reminder) => reminder.type === "receivable_due")).toBe(false);
  });

  it("honours type switches and ignores completed, archived and settled entities", () => {
    const settings = enabledSettings();
    settings.types.weekly_review.enabled = false;
    settings.types.planned_expense.enabled = false;
    const state = snapshot({
      recurringItems: [{
        id: "archived", categoryId: "c", label: "Old", amount: { minorUnits: 1, currency: "XOF" },
        direction: "expense", frequency: "weekly", startDate: now, lastRealised: null, isArchived: true,
      }],
      debtCredits: [{
        id: "settled", kind: "debt", partyName: "Done", motive: "Done",
        amount: { minorUnits: 1, currency: "XOF" }, date: now, status: "settled",
        dueDate: inDays(1),
      }],
    });

    expect(computeReminderQueue(state, settings, now)).toEqual([]);
  });
});

describe("queue persistence and inbox", () => {
  function onePlannedExpense(): FinancialStateSnapshot {
    return snapshot({
      plannedExpenses: [{
        id: "planned-1",
        label: "School fees",
        estimatedAmount: { minorUnits: 25_000, currency: "XOF" },
        categoryId: "category-1",
        priority: "high",
        dueDate: inDays(-1),
        note: "must never leak",
        status: "pending",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
        transactionId: null,
        completedAccountId: null,
        actualAmount: null,
      }],
    });
  }

  it("atomically replaces the SW queue and stores no amount, balance or note", async () => {
    const local = new MemoryStorage();
    const system = systemQueue();
    const settings = enabledSettings();
    settings.types.weekly_review.enabled = false;

    const reminders = await rebuildReminderQueue(onePlannedExpense(), {
      storage: local,
      systemQueue: system.storage,
      settings,
      locale: "fr",
      now,
    });

    expect(reminders).toHaveLength(1);
    expect(system.replaceAll).toHaveBeenCalledOnce();
    expect(system.replaceAll.mock.calls[0]![0]).toMatchObject([{
      id: reminders[0]!.id,
      label: "School fees",
      locale: "fr",
      href: "/planned-expenses",
    }]);
    expect(local.writes).toHaveLength(1);
    const persisted = local.writes[0]!.value;
    expect(persisted).not.toMatch(/minorUnits|estimatedAmount|actualAmount|balance|must never leak/);
  });

  it("does not publish a partial inbox when atomic SW replacement fails", async () => {
    const local = new MemoryStorage();
    const replacement = vi.fn<(reminders: readonly LocalReminder[]) => Promise<void>>()
      .mockRejectedValue(new Error("IDB transaction aborted"));
    const system = systemQueue(replacement);
    const settings = enabledSettings();
    settings.types.weekly_review.enabled = false;

    await expect(rebuildReminderQueue(onePlannedExpense(), {
      storage: local,
      systemQueue: system.storage,
      settings,
      now,
    })).rejects.toThrow("IDB transaction aborted");
    expect(local.writes).toHaveLength(0);
  });

  it("marks, dismisses and preserves state across stable rebuilds", async () => {
    const local = new MemoryStorage();
    const system = systemQueue();
    const settings = enabledSettings();
    settings.types.weekly_review.enabled = false;
    const first = await rebuildReminderQueue(onePlannedExpense(), {
      storage: local,
      systemQueue: system.storage,
      settings,
      now,
    });
    const id = first[0]!.id;

    expect(markReminderRead(id, local, now + 1)).toBe(true);
    expect(loadReminderInbox({ storage: local, now })[0]?.readAt).toBe(now + 1);
    const second = await rebuildReminderQueue(onePlannedExpense(), {
      storage: local,
      systemQueue: system.storage,
      settings,
      now,
    });
    expect(second[0]?.readAt).toBe(now + 1);
    expect(dismissReminder(id, local, now + 2)).toBe(true);
    expect(loadReminderInbox({ storage: local, now })).toEqual([]);
  });

  it("keeps future entries out of the inbox until their trigger time", async () => {
    const local = new MemoryStorage();
    const system = systemQueue();
    const settings = enabledSettings();
    settings.types.weekly_review.enabled = false;
    settings.types.planned_expense.leadDays = [0];
    const state = onePlannedExpense();
    state.plannedExpenses[0]!.dueDate = inDays(2);

    await rebuildReminderQueue(state, {
      storage: local,
      systemQueue: system.storage,
      settings,
      now,
    });
    expect(loadReminderInbox({ storage: local, now })).toEqual([]);
    expect(loadReminderInbox({ storage: local, now: inDays(2) })).toHaveLength(1);
  });
});
