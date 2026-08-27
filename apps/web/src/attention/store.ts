import type { DashboardAlert } from "../analytics/dashboard.ts";

export const DASHBOARD_ATTENTION_STORAGE_KEY = "wisemoney.dashboard.attention.v1";

export type DashboardAlertState = {
  readAt: number | null;
  dismissedAt: number | null;
  snoozedUntil: number | null;
};

type StoredAttention = {
  version: 1;
  states: Record<string, DashboardAlertState>;
};

type AttentionStorage = Pick<Storage, "getItem" | "setItem">;

const EMPTY_STATE: DashboardAlertState = { readAt: null, dismissedAt: null, snoozedUntil: null };

function defaultStorage(): AttentionStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
function isTimestamp(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function validState(value: unknown): value is DashboardAlertState {
  if (value == null || typeof value !== "object") return false;
  const state = value as Partial<DashboardAlertState>;
  return isTimestamp(state.readAt) && isTimestamp(state.dismissedAt) && isTimestamp(state.snoozedUntil);
}

function load(storage: AttentionStorage | null): StoredAttention {
  if (storage == null) return { version: 1, states: {} };
  try {
    const raw = storage.getItem(DASHBOARD_ATTENTION_STORAGE_KEY);
    if (raw == null) return { version: 1, states: {} };
    const parsed = JSON.parse(raw) as Partial<StoredAttention>;
    if (parsed.version !== 1 || parsed.states == null || typeof parsed.states !== "object") {
      return { version: 1, states: {} };
    }
    return {
      version: 1,
      states: Object.fromEntries(Object.entries(parsed.states).filter((entry) => validState(entry[1]))),
    };
  } catch {
    return { version: 1, states: {} };
  }
}

function save(value: StoredAttention, storage: AttentionStorage | null): void {
  if (storage == null) return;
  try {
    storage.setItem(DASHBOARD_ATTENTION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The dashboard remains functional when storage is unavailable.
  }
}

function update(
  alertId: string,
  patch: Partial<DashboardAlertState>,
  storage: AttentionStorage | null,
): DashboardAlertState {
  const stored = load(storage);
  const next = { ...EMPTY_STATE, ...stored.states[alertId], ...patch };
  stored.states[alertId] = next;
  save(stored, storage);
  return next;
}

export function loadDashboardAlertStates(storage: AttentionStorage | null = defaultStorage()): Record<string, DashboardAlertState> {
  return load(storage).states;
}

export function markDashboardAlertRead(alertId: string, now = Date.now(), storage: AttentionStorage | null = defaultStorage()): void {
  update(alertId, { readAt: now }, storage);
}

export function dismissDashboardAlert(alertId: string, now = Date.now(), storage: AttentionStorage | null = defaultStorage()): void {
  update(alertId, { dismissedAt: now }, storage);
}

export function snoozeDashboardAlert(alertId: string, until: number, storage: AttentionStorage | null = defaultStorage()): void {
  if (!Number.isSafeInteger(until) || until < 0) throw new Error("snooze timestamp is invalid");
  update(alertId, { snoozedUntil: until }, storage);
}

export function restoreDashboardAlert(alertId: string, storage: AttentionStorage | null = defaultStorage()): void {
  update(alertId, { dismissedAt: null, snoozedUntil: null }, storage);
}

export function selectVisibleDashboardAlerts(
  alerts: readonly DashboardAlert[],
  states: Readonly<Record<string, DashboardAlertState>>,
  now = Date.now(),
): DashboardAlert[] {
  return alerts.filter((alert) => {
    const state = states[alert.id];
    return state?.dismissedAt == null && (state?.snoozedUntil == null || state.snoozedUntil <= now);
  });
}
