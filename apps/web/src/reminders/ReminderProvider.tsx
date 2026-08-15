import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import i18n from "../i18n.ts";
import { createWeeklyReviewCalendar, downloadCalendarExport } from "../calendar/ics.ts";
import { useFinancialState } from "../hooks/useFinancialState.ts";
import {
  dismissReminder,
  loadReminderInbox,
  loadReminderSettings,
  markReminderRead,
  rebuildReminderQueue,
  REMINDERS_CHANGED_EVENT,
  saveReminderSettings,
  type InAppReminder,
  type ReminderSettings,
} from "./index.ts";

type PermissionState = NotificationPermission | "unsupported";

type ReminderContextValue = {
  settings: ReminderSettings;
  reminders: InAppReminder[];
  permission: PermissionState;
  updateSettings: (settings: ReminderSettings) => void;
  requestPermission: () => Promise<void>;
  testNotification: () => Promise<void>;
  exportWeeklyCalendar: () => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);

function notificationPermission(): PermissionState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function nextWeeklyReview(settings: ReminderSettings, now = Date.now()): number {
  const next = new Date(now);
  next.setHours(settings.weeklyReview.hour, 0, 0, 0);
  const daysAhead = (settings.weeklyReview.weekday - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + daysAhead);
  if (next.getTime() <= now) next.setDate(next.getDate() + 7);
  return next.getTime();
}

export function ReminderProvider({ children }: { children: ReactNode }) {
  const { data: snapshot } = useFinancialState();
  const [settings, setSettings] = useState(loadReminderSettings);
  const [reminders, setReminders] = useState(() => loadReminderInbox());
  const [permission, setPermission] = useState<PermissionState>(notificationPermission);

  const refreshInbox = useCallback(() => setReminders(loadReminderInbox()), []);

  useEffect(() => {
    window.addEventListener(REMINDERS_CHANGED_EVENT, refreshInbox);
    const refreshPermission = () => setPermission(notificationPermission());
    document.addEventListener("visibilitychange", refreshPermission);
    return () => {
      window.removeEventListener(REMINDERS_CHANGED_EVENT, refreshInbox);
      document.removeEventListener("visibilitychange", refreshPermission);
    };
  }, [refreshInbox]);

  useEffect(() => {
    if (snapshot == null) return;
    let active = true;
    void rebuildReminderQueue(snapshot, { settings })
      .then(() => {
        if (active) refreshInbox();
      })
      .catch(() => {
        if (active) toast.error(i18n.t("reminders.errors.rebuild"));
      });
    return () => {
      active = false;
    };
  }, [refreshInbox, settings, snapshot]);

  const updateSettings = useCallback((next: ReminderSettings) => {
    const saved = saveReminderSettings(next);
    setSettings(saved);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") toast.success(i18n.t("reminders.messages.permissionGranted"));
  }, []);

  const testNotification = useCallback(async () => {
    if (notificationPermission() !== "granted" || !("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(i18n.t("reminders.test.title"), {
      body: i18n.t("reminders.test.body"),
      icon: "/icons/wisemoney-icon-192.png",
      tag: "wisemoney-reminder-test",
    });
  }, []);

  const exportWeeklyCalendar = useCallback(() => {
    const locale = i18n.language.toLowerCase().startsWith("fr") ? "fr" : "en";
    downloadCalendarExport(createWeeklyReviewCalendar({
      firstReviewAt: nextWeeklyReview(settings),
      locale,
    }));
  }, [settings]);

  const markRead = useCallback((id: string) => {
    markReminderRead(id);
    refreshInbox();
  }, [refreshInbox]);

  const dismiss = useCallback((id: string) => {
    dismissReminder(id);
    refreshInbox();
  }, [refreshInbox]);

  const value = useMemo<ReminderContextValue>(() => ({
    settings,
    reminders,
    permission,
    updateSettings,
    requestPermission,
    testNotification,
    exportWeeklyCalendar,
    markRead,
    dismiss,
  }), [dismiss, exportWeeklyCalendar, markRead, permission, reminders, requestPermission, settings, testNotification, updateSettings]);

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
}

export function useReminders(): ReminderContextValue {
  const value = useContext(ReminderContext);
  if (value == null) throw new Error("useReminders must be used within ReminderProvider");
  return value;
}
