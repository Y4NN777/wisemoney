import { describe, expect, it } from "vitest";
import type { DashboardAlert } from "../analytics/dashboard.ts";
import {
  dismissDashboardAlert,
  loadDashboardAlertStates,
  markDashboardAlertRead,
  restoreDashboardAlert,
  selectVisibleDashboardAlerts,
  snoozeDashboardAlert,
} from "./store.ts";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const alert: DashboardAlert = {
  id: "budget-threshold:food:2026-08:90",
  kind: "budget_threshold",
  severity: "attention",
  entityId: "food",
  threshold: 90,
};

describe("dashboard attention state", () => {
  it("persists read and dismissed state against a stable alert id", () => {
    const store = storage();
    markDashboardAlertRead(alert.id, 10, store);
    dismissDashboardAlert(alert.id, 20, store);
    expect(loadDashboardAlertStates(store)[alert.id]).toEqual({ readAt: 10, dismissedAt: 20, snoozedUntil: null });
    expect(selectVisibleDashboardAlerts([alert], loadDashboardAlertStates(store), 30)).toEqual([]);
  });

  it("temporarily hides snoozed alerts and restores them after the deadline", () => {
    const store = storage();
    snoozeDashboardAlert(alert.id, 100, store);
    const states = loadDashboardAlertStates(store);
    expect(selectVisibleDashboardAlerts([alert], states, 99)).toEqual([]);
    expect(selectVisibleDashboardAlerts([alert], states, 100)).toEqual([alert]);
  });

  it("supports undo after a dismissal", () => {
    const store = storage();
    dismissDashboardAlert(alert.id, 10, store);
    restoreDashboardAlert(alert.id, store);
    expect(selectVisibleDashboardAlerts([alert], loadDashboardAlertStates(store), 20)).toEqual([alert]);
  });

  it("ignores corrupt persisted state", () => {
    const store = storage();
    store.setItem("wisemoney.dashboard.attention.v1", "not-json");
    expect(loadDashboardAlertStates(store)).toEqual({});
  });
});
