import type { AppFaultCode } from "../help/context.ts";
import type { HelpLocale, SurfaceId } from "../help/corpus.ts";

const SETTINGS_KEY = "wisemoney.coach.settings.v1";
const HISTORY_KEY = "wisemoney.coach.history.v1";
const FORM_FAULTS_KEY = "wisemoney.coach.form-faults.v1";
export const COACH_FORM_FAULT_EVENT = "wisemoney:coach-form-fault";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type CoachEventType = "shown" | "later" | "dismissed" | "help_opened" | "bot_opened" | "completed" | "notification_delivered" | "notification_clicked";

export type CoachSettings = {
  version: 1;
  inAppEnabled: boolean;
  notificationsEnabled: boolean;
  pausedUntil: number | null;
};

export type CoachEvent = {
  nudgeId: string;
  type: CoachEventType;
  at: number;
};

export type CoachHistory = {
  version: 1;
  firstActiveAt: number;
  lastActiveAt: number;
  lastNotificationAt: number | null;
  dismissStreak: number;
  events: CoachEvent[];
};

export type LocalCoachContext = {
  locale: HelpLocale;
  surfaceId: SurfaceId;
  sessionStartedAt: number;
  sessionNudgeShown: boolean;
  interactionBusy: boolean;
  wiseBotOpen: boolean;
  accountCount: number;
  hasTransaction: boolean;
  hasTransfer: boolean;
  planningUsed: boolean;
  remindersEnabled: boolean;
  hasDatedItems: boolean;
  backupCreated: boolean;
  repeatedFaultCode: AppFaultCode | null;
  repeatedTaskId: string | null;
};

export type CoachNudge = {
  id: string;
  taskId: string;
  kind: "recovery" | "first-step" | "discovery" | "general";
};

export type CoachDecision =
  | { kind: "show"; nudge: CoachNudge }
  | { kind: "none"; reason: "disabled" | "paused" | "too-early" | "busy" | "session-limit" | "weekly-limit" | "cooldown" | "no-candidate" };

export const DEFAULT_COACH_SETTINGS: CoachSettings = {
  version: 1,
  inAppEnabled: true,
  notificationsEnabled: false,
  pausedUntil: null,
};

function normaliseSettings(value: unknown): CoachSettings {
  if (value == null || typeof value !== "object") return { ...DEFAULT_COACH_SETTINGS };
  const input = value as Partial<CoachSettings>;
  return {
    version: 1,
    inAppEnabled: input.inAppEnabled !== false,
    notificationsEnabled: input.notificationsEnabled === true,
    pausedUntil: Number.isSafeInteger(input.pausedUntil) && Number(input.pausedUntil) >= 0 ? Number(input.pausedUntil) : null,
  };
}

function emptyHistory(now: number): CoachHistory {
  return { version: 1, firstActiveAt: now, lastActiveAt: now, lastNotificationAt: null, dismissStreak: 0, events: [] };
}

function normaliseHistory(value: unknown, now: number): CoachHistory {
  if (value == null || typeof value !== "object") return emptyHistory(now);
  const input = value as Partial<CoachHistory>;
  const events = Array.isArray(input.events) ? input.events.flatMap((entry) => {
    if (entry == null || typeof entry !== "object") return [];
    const event = entry as Partial<CoachEvent>;
    if (typeof event.nudgeId !== "string" || !Number.isSafeInteger(event.at) ||
      !["shown", "later", "dismissed", "help_opened", "bot_opened", "completed", "notification_delivered", "notification_clicked"].includes(event.type ?? "")) return [];
    return [{ nudgeId: event.nudgeId.slice(0, 80), type: event.type as CoachEventType, at: Number(event.at) }];
  }).slice(-200) : [];
  return {
    version: 1,
    firstActiveAt: Number.isSafeInteger(input.firstActiveAt) ? Number(input.firstActiveAt) : now,
    lastActiveAt: Number.isSafeInteger(input.lastActiveAt) ? Number(input.lastActiveAt) : now,
    lastNotificationAt: Number.isSafeInteger(input.lastNotificationAt) ? Number(input.lastNotificationAt) : null,
    dismissStreak: Number.isSafeInteger(input.dismissStreak) && Number(input.dismissStreak) >= 0 ? Math.min(Number(input.dismissStreak), 3) : 0,
    events,
  };
}

export function loadCoachSettings(storage?: Pick<Storage, "getItem"> | null): CoachSettings {
  const target = storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : storage;
  if (target == null) return { ...DEFAULT_COACH_SETTINGS };
  try { return normaliseSettings(JSON.parse(target.getItem(SETTINGS_KEY) ?? "null") as unknown); } catch { return { ...DEFAULT_COACH_SETTINGS }; }
}

export function saveCoachSettings(settings: CoachSettings, storage?: Pick<Storage, "setItem"> | null): CoachSettings {
  const saved = normaliseSettings(settings);
  const target = storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : storage;
  try { target?.setItem(SETTINGS_KEY, JSON.stringify(saved)); } catch { /* Preferences remain active in memory. */ }
  return saved;
}

export function loadCoachHistory(storage?: Pick<Storage, "getItem"> | null, now = Date.now()): CoachHistory {
  const target = storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : storage;
  if (target == null) return emptyHistory(now);
  try { return normaliseHistory(JSON.parse(target.getItem(HISTORY_KEY) ?? "null") as unknown, now); } catch { return emptyHistory(now); }
}

export function saveCoachHistory(history: CoachHistory, storage?: Pick<Storage, "setItem"> | null, now = Date.now()): CoachHistory {
  const saved = normaliseHistory(history, now);
  const target = storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : storage;
  try { target?.setItem(HISTORY_KEY, JSON.stringify(saved)); } catch { /* History remains active in memory. */ }
  return saved;
}

export function recordCoachEvent(history: CoachHistory, nudgeId: string, type: CoachEventType, now = Date.now()): CoachHistory {
  return normaliseHistory({
    ...history,
    lastActiveAt: now,
    lastNotificationAt: type === "notification_delivered" ? now : history.lastNotificationAt,
    dismissStreak: type === "dismissed" ? Math.min(3, history.dismissStreak + 1) : type === "shown" || type === "later" ? history.dismissStreak : 0,
    events: [...history.events, { nudgeId, type, at: now }],
  }, now);
}

export function pauseAfterDismissals(settings: CoachSettings, history: CoachHistory, now = Date.now()): CoachSettings {
  return history.dismissStreak >= 3 ? { ...settings, pausedUntil: now + 14 * DAY_MS } : settings;
}

export function resetCoachHistory(now = Date.now()): CoachHistory {
  return emptyHistory(now);
}

function recentEvent(history: CoachHistory, nudgeId: string, types: CoachEventType[]): CoachEvent | null {
  return [...history.events].reverse().find((event) => event.nudgeId === nudgeId && types.includes(event.type)) ?? null;
}

function candidate(context: LocalCoachContext, history: CoachHistory, now: number): CoachNudge | null {
  if (context.repeatedTaskId != null) return { id: `recovery-form-${context.repeatedTaskId}`, taskId: context.repeatedTaskId, kind: "recovery" };
  if (context.repeatedFaultCode != null) return { id: `recovery-${context.repeatedFaultCode}`, taskId: "hors-ligne", kind: "recovery" };
  if (context.accountCount === 0) return { id: "first-account", taskId: "comptes", kind: "first-step" };
  if (!context.hasTransaction) return { id: "first-transaction", taskId: "transactions", kind: "first-step" };
  if (context.accountCount >= 2 && !context.hasTransfer) return { id: "discover-transfer", taskId: "virements", kind: "discovery" };
  if (context.hasDatedItems && !context.remindersEnabled) return { id: "enable-reminders", taskId: "rappels", kind: "discovery" };
  if (now - history.firstActiveAt >= 7 * DAY_MS && !context.backupCreated) return { id: "create-backup", taskId: "sauvegarde", kind: "discovery" };
  if (now - history.lastActiveAt >= 14 * DAY_MS) return { id: "return-review", taskId: "tableau-de-bord", kind: "discovery" };
  if (now - history.firstActiveAt >= 3 * DAY_MS && !context.planningUsed) return { id: "discover-planning", taskId: "budgets", kind: "discovery" };
  const general = ["tableau-de-bord", "depenses-prevues", "recurrent", "securite"] as const;
  const taskId = general[Math.floor(now / WEEK_MS) % general.length] ?? "tableau-de-bord";
  return { id: `weekly-${taskId}`, taskId, kind: "general" };
}

export function decideCoachNudge(
  context: LocalCoachContext,
  settings: CoachSettings,
  history: CoachHistory,
  now = Date.now(),
): CoachDecision {
  if (!settings.inAppEnabled) return { kind: "none", reason: "disabled" };
  if (settings.pausedUntil != null && settings.pausedUntil > now) return { kind: "none", reason: "paused" };
  if (now - context.sessionStartedAt < 20_000) return { kind: "none", reason: "too-early" };
  if (context.interactionBusy || context.wiseBotOpen) return { kind: "none", reason: "busy" };
  if (context.sessionNudgeShown) return { kind: "none", reason: "session-limit" };
  if (history.events.filter((event) => event.type === "shown" && event.at >= now - WEEK_MS).length >= 2) {
    return { kind: "none", reason: "weekly-limit" };
  }
  const nudge = candidate(context, history, now);
  if (nudge == null) return { kind: "none", reason: "no-candidate" };
  const dismissed = recentEvent(history, nudge.id, ["dismissed", "later"]);
  if (dismissed != null && dismissed.at >= now - 30 * DAY_MS) return { kind: "none", reason: "cooldown" };
  const completed = recentEvent(history, nudge.id, ["completed", "help_opened", "bot_opened"]);
  if (completed != null && completed.at >= now - 90 * DAY_MS) return { kind: "none", reason: "cooldown" };
  return { kind: "show", nudge };
}

export function canScheduleCoachNotification(settings: CoachSettings, history: CoachHistory, now = Date.now()): boolean {
  return settings.notificationsEnabled && (history.lastNotificationAt == null || history.lastNotificationAt <= now - WEEK_MS);
}

export function recordCoachFormFault(
  faultId: string,
  taskId: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
  now = Date.now(),
): boolean {
  if (!/^[a-z0-9.-]{1,80}$/.test(faultId) || !/^[a-z0-9-]{1,80}$/.test(taskId)) return false;
  const cutoff = now - 10 * 60 * 1000;
  let previous: Array<{ faultId: string; taskId: string; at: number }> = [];
  try {
    const parsed = JSON.parse(storage?.getItem(FORM_FAULTS_KEY) ?? "[]") as unknown;
    if (Array.isArray(parsed)) previous = parsed.flatMap((item) => {
      if (item == null || typeof item !== "object") return [];
      const entry = item as { faultId?: unknown; taskId?: unknown; at?: unknown };
      return typeof entry.faultId === "string" && typeof entry.taskId === "string" && Number.isSafeInteger(entry.at) && Number(entry.at) >= cutoff
        ? [{ faultId: entry.faultId, taskId: entry.taskId, at: Number(entry.at) }]
        : [];
    });
  } catch { previous = []; }
  const next = [...previous, { faultId, taskId, at: now }].slice(-20);
  try { storage?.setItem(FORM_FAULTS_KEY, JSON.stringify(next)); } catch { /* Detection remains best-effort. */ }
  const repeated = next.filter((entry) => entry.faultId === faultId).length >= 2;
  if (repeated && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COACH_FORM_FAULT_EVENT, { detail: { taskId } }));
  }
  return repeated;
}

export function recordCoachNotificationClick(taskId: string, now = Date.now()): void {
  if (!/^[a-z0-9-]{1,80}$/.test(taskId)) return;
  const current = loadCoachHistory(undefined, now);
  saveCoachHistory(recordCoachEvent(current, `notification-${taskId}`, "notification_clicked", now));
}
