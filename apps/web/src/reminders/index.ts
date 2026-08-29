import type { FinancialStateSnapshot } from "@/domain/financialState.ts";
import {
  getReminderQueueStorage,
  notifyReminderQueueUpdated,
  type LocalReminder,
  type ReminderLocale,
  type ReminderQueueStorage,
} from "@/pwa/reminderQueue.ts";

export type ReminderType =
  | "weekly_review"
  | "planned_expense"
  | "recurring_item"
  | "budget_threshold"
  | "debt_due"
  | "receivable_due";

export type ReminderTypeSettings = {
  enabled: boolean;
  /** Calendar-day offsets before an occurrence. Zero means the due day. */
  leadDays: number[];
};

export type ReminderSettings = {
  version: 1;
  /** Explicit user opt-in. No reminder is produced while false. */
  enabled: boolean;
  /** Optional cue while the app is open; background sound remains OS-controlled. */
  foregroundSound: boolean;
  types: Record<ReminderType, ReminderTypeSettings>;
  /** Sunday = 0, Saturday = 6. */
  weeklyReview: {
    weekday: number;
    hour: number;
  };
  budgetThresholds: Array<70 | 90 | 100>;
};

export type ReminderQueueEntry = {
  id: string;
  type: ReminderType;
  entityId: string;
  /** Deliberately the only financial copy stored in plaintext; never add amounts or notes. */
  label: string;
  occurrenceKey: string;
  dueAt: number;
  triggerAt: number;
  leadDays: number | null;
  budgetThreshold: 70 | 90 | 100 | null;
};

export type InAppReminder = ReminderQueueEntry & {
  readAt: number | null;
  dismissedAt: number | null;
};

type ReminderStorage = Pick<Storage, "getItem" | "setItem">;

type StoredReminderQueue = {
  version: 1;
  rebuiltAt: number;
  reminders: InAppReminder[];
};

export const REMINDERS_CHANGED_EVENT = "wisemoney:reminders-changed";

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  version: 1,
  enabled: false,
  foregroundSound: false,
  types: {
    weekly_review: { enabled: true, leadDays: [0] },
    planned_expense: { enabled: true, leadDays: [7, 3, 0] },
    recurring_item: { enabled: true, leadDays: [7, 3, 0] },
    budget_threshold: { enabled: true, leadDays: [] },
    debt_due: { enabled: true, leadDays: [7, 3, 0] },
    receivable_due: { enabled: true, leadDays: [7, 3, 0] },
  },
  weeklyReview: { weekday: 0, hour: 18 },
  budgetThresholds: [70, 90, 100],
};

const SETTINGS_STORAGE_KEY = "wisemoney:reminders:settings:v1";
const QUEUE_STORAGE_KEY = "wisemoney:reminders:queue:v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_TYPES: readonly ReminderType[] = [
  "weekly_review",
  "planned_expense",
  "recurring_item",
  "budget_threshold",
  "debt_due",
  "receivable_due",
];
const ALLOWED_BUDGET_THRESHOLDS = new Set([70, 90, 100]);

function defaultStorage(): ReminderStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function cloneDefaultSettings(): ReminderSettings {
  return {
    ...DEFAULT_REMINDER_SETTINGS,
    enabled: DEFAULT_REMINDER_SETTINGS.enabled,
    foregroundSound: DEFAULT_REMINDER_SETTINGS.foregroundSound,
    types: Object.fromEntries(REMINDER_TYPES.map((type) => [
      type,
      {
        enabled: DEFAULT_REMINDER_SETTINGS.types[type].enabled,
        leadDays: [...DEFAULT_REMINDER_SETTINGS.types[type].leadDays],
      },
    ])) as Record<ReminderType, ReminderTypeSettings>,
    weeklyReview: { ...DEFAULT_REMINDER_SETTINGS.weeklyReview },
    budgetThresholds: [...DEFAULT_REMINDER_SETTINGS.budgetThresholds],
  };
}

function normaliseLeadDays(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter(
    (day): day is number => Number.isSafeInteger(day) && day >= 0 && day <= 365,
  ))].sort((left, right) => right - left);
}

function normaliseSettings(value: unknown): ReminderSettings {
  const defaults = cloneDefaultSettings();
  if (value == null || typeof value !== "object" || Array.isArray(value)) return defaults;
  const candidate = value as Record<string, unknown>;
  defaults.enabled = typeof candidate.enabled === "boolean" ? candidate.enabled : defaults.enabled;
  defaults.foregroundSound = typeof candidate.foregroundSound === "boolean" ? candidate.foregroundSound : defaults.foregroundSound;
  const candidateTypes = candidate.types != null && typeof candidate.types === "object"
    ? candidate.types as Record<string, unknown>
    : {};
  for (const type of REMINDER_TYPES) {
    const raw = candidateTypes[type];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    defaults.types[type] = {
      enabled: typeof entry.enabled === "boolean"
        ? entry.enabled
        : defaults.types[type].enabled,
      leadDays: normaliseLeadDays(entry.leadDays, defaults.types[type].leadDays),
    };
  }

  const weeklyReview = candidate.weeklyReview;
  if (weeklyReview != null && typeof weeklyReview === "object" && !Array.isArray(weeklyReview)) {
    const raw = weeklyReview as Record<string, unknown>;
    if (Number.isSafeInteger(raw.weekday) && (raw.weekday as number) >= 0 && (raw.weekday as number) <= 6) {
      defaults.weeklyReview.weekday = raw.weekday as number;
    }
    if (Number.isSafeInteger(raw.hour) && (raw.hour as number) >= 0 && (raw.hour as number) <= 23) {
      defaults.weeklyReview.hour = raw.hour as number;
    }
  }

  if (Array.isArray(candidate.budgetThresholds)) {
    const thresholds = [...new Set(candidate.budgetThresholds.filter(
      (threshold): threshold is 70 | 90 | 100 =>
        typeof threshold === "number" && ALLOWED_BUDGET_THRESHOLDS.has(threshold),
    ))].sort((left, right) => left - right);
    defaults.budgetThresholds = thresholds;
  }
  return defaults;
}

export function loadReminderSettings(storage: ReminderStorage | null = defaultStorage()): ReminderSettings {
  if (storage == null) return cloneDefaultSettings();
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    return raw == null ? cloneDefaultSettings() : normaliseSettings(JSON.parse(raw) as unknown);
  } catch {
    return cloneDefaultSettings();
  }
}

export function saveReminderSettings(
  settings: ReminderSettings,
  storage: ReminderStorage | null = defaultStorage(),
): ReminderSettings {
  const normalised = normaliseSettings(settings);
  if (storage != null) storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalised));
  dispatchRemindersChanged();
  return normalised;
}

function isQueueEntry(value: unknown): value is InAppReminder {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    REMINDER_TYPES.includes(item.type as ReminderType) &&
    typeof item.entityId === "string" &&
    typeof item.label === "string" &&
    typeof item.occurrenceKey === "string" &&
    Number.isSafeInteger(item.dueAt) &&
    Number.isSafeInteger(item.triggerAt) &&
    (item.leadDays === null || Number.isSafeInteger(item.leadDays)) &&
    (item.budgetThreshold === null || ALLOWED_BUDGET_THRESHOLDS.has(item.budgetThreshold as number)) &&
    (item.readAt === null || Number.isSafeInteger(item.readAt)) &&
    (item.dismissedAt === null || Number.isSafeInteger(item.dismissedAt));
}

function loadStoredQueue(storage: ReminderStorage | null): StoredReminderQueue {
  if (storage == null) return { version: 1, rebuiltAt: 0, reminders: [] };
  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY);
    if (raw == null) return { version: 1, rebuiltAt: 0, reminders: [] };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 1 || !Array.isArray(parsed.reminders)) {
      return { version: 1, rebuiltAt: 0, reminders: [] };
    }
    return {
      version: 1,
      rebuiltAt: Number.isSafeInteger(parsed.rebuiltAt) ? parsed.rebuiltAt as number : 0,
      reminders: parsed.reminders.filter(isQueueEntry),
    };
  } catch {
    return { version: 1, rebuiltAt: 0, reminders: [] };
  }
}

function persistQueue(queue: StoredReminderQueue, storage: ReminderStorage | null): void {
  if (storage != null) storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  dispatchRemindersChanged();
}

function dispatchRemindersChanged(): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
  }
}

function localDayOffset(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() - days);
  return date.getTime();
}

function stablePart(value: string): string {
  return encodeURIComponent(value);
}

function makeEntry(
  type: ReminderType,
  entityId: string,
  label: string,
  dueAt: number,
  leadDays: number | null,
  budgetThreshold: 70 | 90 | 100 | null = null,
  triggerAt = leadDays == null ? dueAt : localDayOffset(dueAt, leadDays),
): ReminderQueueEntry {
  const occurrenceKey = `${type}:${stablePart(entityId)}:${dueAt}`;
  const stage = budgetThreshold == null ? `j-${leadDays ?? 0}` : `threshold-${budgetThreshold}`;
  return {
    id: `${occurrenceKey}:${stage}`,
    type,
    entityId,
    label,
    occurrenceKey,
    dueAt,
    triggerAt,
    leadDays,
    budgetThreshold,
  };
}

function addTimedOccurrence(
  entries: ReminderQueueEntry[],
  type: ReminderType,
  entityId: string,
  label: string,
  dueAt: number,
  settings: ReminderSettings,
): void {
  const typeSettings = settings.types[type];
  if (!typeSettings.enabled || !Number.isSafeInteger(dueAt) || dueAt < 0) return;
  for (const leadDays of typeSettings.leadDays) {
    entries.push(makeEntry(type, entityId, label, dueAt, leadDays));
  }
}

function nextWeeklyReviewAt(now: number, settings: ReminderSettings): number {
  const occurrence = new Date(now);
  occurrence.setHours(settings.weeklyReview.hour, 0, 0, 0);
  const daysUntilReview = (settings.weeklyReview.weekday - occurrence.getDay() + 7) % 7;
  occurrence.setDate(occurrence.getDate() + daysUntilReview);
  if (occurrence.getTime() <= now) occurrence.setDate(occurrence.getDate() + 7);
  return occurrence.getTime();
}

function isSameLocalDay(left: number, right: number): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function advanceRecurringDate(
  frequency: "weekly" | "monthly" | "yearly",
  timestamp: number,
  anchorDay: number,
): number {
  const date = new Date(timestamp);
  if (frequency === "weekly") {
    date.setDate(date.getDate() + 7);
    return date.getTime();
  }
  date.setDate(1);
  if (frequency === "monthly") date.setMonth(date.getMonth() + 1);
  else date.setFullYear(date.getFullYear() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(anchorDay, lastDay));
  return date.getTime();
}

function nextRecurringDue(
  frequency: "weekly" | "monthly" | "yearly",
  startDate: number,
  lastRealised: number | null,
  now: number,
): number | null {
  if (!Number.isSafeInteger(startDate) || startDate < 0) return null;
  let dueAt = startDate;
  const anchorDay = new Date(startDate).getDate();
  while (
    (lastRealised != null && dueAt <= lastRealised) ||
    (dueAt <= now && !isSameLocalDay(dueAt, now))
  ) {
    const next = advanceRecurringDate(frequency, dueAt, anchorDay);
    if (!Number.isSafeInteger(next) || next <= dueAt) return null;
    dueAt = next;
  }
  return dueAt;
}

function structuralDueDate(value: unknown): number | null {
  if (value == null || typeof value !== "object" || !("dueDate" in value)) return null;
  const dueDate = (value as { dueDate?: unknown }).dueDate;
  return Number.isSafeInteger(dueDate) && (dueDate as number) >= 0 ? dueDate as number : null;
}

function periodEnd(periodMonth: string): number | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) return null;
  const [yearText, monthText] = periodMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return new Date(year, month, 0, 23, 59, 59, 999).getTime();
}

function currentPeriodMonth(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function collapseMissed(entries: ReminderQueueEntry[], now: number): ReminderQueueEntry[] {
  const byOccurrence = new Map<string, ReminderQueueEntry[]>();
  for (const entry of entries) {
    const grouped = byOccurrence.get(entry.occurrenceKey) ?? [];
    grouped.push(entry);
    byOccurrence.set(entry.occurrenceKey, grouped);
  }

  const result: ReminderQueueEntry[] = [];
  for (const grouped of byOccurrence.values()) {
    const missed = grouped
      .filter((entry) => entry.triggerAt <= now)
      .sort((left, right) => right.triggerAt - left.triggerAt || left.id.localeCompare(right.id));
    if (missed[0] != null) result.push(missed[0]);
    result.push(...grouped.filter((entry) => entry.triggerAt > now));
  }
  return result;
}

function compareQueueEntries(left: ReminderQueueEntry, right: ReminderQueueEntry): number {
  return left.triggerAt - right.triggerAt ||
    left.dueAt - right.dueAt ||
    left.type.localeCompare(right.type) ||
    left.id.localeCompare(right.id);
}

function reminderHref(type: ReminderType): string {
  switch (type) {
    case "planned_expense": return "/planned-expenses";
    case "recurring_item": return "/recurring";
    case "budget_threshold": return "/budgets";
    case "debt_due":
    case "receivable_due": return "/debts";
    case "weekly_review": return "/";
  }
}

function currentLocale(): ReminderLocale {
  return typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("fr")
    ? "fr"
    : "en";
}

function toLocalReminder(
  reminder: ReminderQueueEntry,
  locale: ReminderLocale,
  now: number,
): LocalReminder {
  return {
    kind: "financial",
    id: reminder.id,
    label: reminder.label.trim().slice(0, 120),
    triggerAt: reminder.triggerAt,
    expiresAt: Math.max(reminder.triggerAt + DAY_MS, reminder.dueAt + DAY_MS, now + DAY_MS),
    locale,
    href: reminderHref(reminder.type),
  };
}

/** Pure projection from the encrypted financial snapshot to a structural queue. */
export function computeReminderQueue(
  snapshot: FinancialStateSnapshot,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
  now = Date.now(),
): ReminderQueueEntry[] {
  const config = normaliseSettings(settings);
  const entries: ReminderQueueEntry[] = [];
  if (!config.enabled) return entries;

  if (config.types.weekly_review.enabled) {
    const dueAt = nextWeeklyReviewAt(now, config);
    addTimedOccurrence(
      entries,
      "weekly_review",
      "weekly-review",
      "Weekly review",
      dueAt,
      config,
    );
  }

  for (const item of snapshot.plannedExpenses) {
    if (item.status === "pending" && item.dueDate != null) {
      addTimedOccurrence(entries, "planned_expense", item.id, item.label, item.dueDate, config);
    }
  }

  for (const item of snapshot.recurringItems) {
    if (item.isArchived) continue;
    const dueAt = nextRecurringDue(item.frequency, item.startDate, item.lastRealised, now);
    if (dueAt != null) addTimedOccurrence(entries, "recurring_item", item.id, item.label, dueAt, config);
  }

  if (config.types.budget_threshold.enabled) {
    const periodMonth = currentPeriodMonth(now);
    for (const budget of snapshot.budgets) {
      if (budget.isArchived || budget.periodMonth !== periodMonth) continue;
      const percentage = snapshot.budgetProgress[budget.id]?.percentage;
      if (percentage == null || !Number.isFinite(percentage)) continue;
      const crossed = config.budgetThresholds.filter((threshold) => percentage >= threshold).at(-1);
      const dueAt = periodEnd(budget.periodMonth);
      if (crossed != null && dueAt != null) {
        entries.push(makeEntry(
          "budget_threshold",
          budget.id,
          budget.name,
          dueAt,
          null,
          crossed,
          now,
        ));
      }
    }
  }

  for (const item of snapshot.debtCredits) {
    if (item.status === "settled") continue;
    const dueAt = structuralDueDate(item);
    if (dueAt == null) continue;
    addTimedOccurrence(
      entries,
      item.kind === "debt" ? "debt_due" : "receivable_due",
      item.id,
      item.partyName,
      dueAt,
      config,
    );
  }

  const unique = new Map<string, ReminderQueueEntry>();
  for (const entry of collapseMissed(entries, now)) unique.set(entry.id, entry);
  return [...unique.values()].sort(compareQueueEntries);
}

export function loadReminderInbox(
  options: { storage?: ReminderStorage | null; now?: number; includeFuture?: boolean } = {},
): InAppReminder[] {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? Date.now();
  return loadStoredQueue(storage).reminders
    .filter((reminder) => reminder.dismissedAt == null)
    .filter((reminder) => options.includeFuture === true || reminder.triggerAt <= now)
    .sort(compareQueueEntries);
}

function updateReminder(
  reminderId: string,
  field: "readAt" | "dismissedAt",
  storage: ReminderStorage | null,
  now: number,
): boolean {
  const queue = loadStoredQueue(storage);
  const reminder = queue.reminders.find((candidate) => candidate.id === reminderId);
  if (reminder == null) return false;
  reminder[field] = now;
  persistQueue(queue, storage);
  return true;
}

export function markReminderRead(
  reminderId: string,
  storage: ReminderStorage | null = defaultStorage(),
  now = Date.now(),
): boolean {
  return updateReminder(reminderId, "readAt", storage, now);
}

export function dismissReminder(
  reminderId: string,
  storage: ReminderStorage | null = defaultStorage(),
  now = Date.now(),
): boolean {
  return updateReminder(reminderId, "dismissedAt", storage, now);
}

/** Replaces only financial reminders, preserving the independent WiseBot coach queue. */
export async function rebuildReminderQueue(
  snapshot: FinancialStateSnapshot,
  options: {
    settings?: ReminderSettings;
    storage?: ReminderStorage | null;
    systemQueue?: ReminderQueueStorage;
    locale?: ReminderLocale;
    serviceWorkerRegistration?: ServiceWorkerRegistration;
    now?: number;
  } = {},
): Promise<InAppReminder[]> {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? Date.now();
  const settings = options.settings ?? loadReminderSettings(storage);
  const previousById = new Map(
    loadStoredQueue(storage).reminders.map((reminder) => [reminder.id, reminder]),
  );
  const reminders = computeReminderQueue(snapshot, settings, now).map((entry) => {
    const previous = previousById.get(entry.id);
    return {
      ...entry,
      readAt: previous?.readAt ?? null,
      dismissedAt: previous?.dismissedAt ?? null,
    };
  });
  const systemQueue = options.systemQueue ?? getReminderQueueStorage();
  await systemQueue.replaceScope("financial", reminders.map((reminder) =>
    toLocalReminder(reminder, options.locale ?? currentLocale(), now)
  ));
  persistQueue({ version: 1, rebuiltAt: now, reminders }, storage);
  notifyReminderQueueUpdated(options.serviceWorkerRegistration);
  return reminders;
}
