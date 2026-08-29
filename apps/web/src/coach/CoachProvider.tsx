import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Bot, BookOpen, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../db/schema.ts";
import { getProductTask } from "../help/corpus.ts";
import { surfaceFromPathname } from "../help/context.ts";
import { openHelp } from "../help/navigation.ts";
import { useWiseBot } from "../help/WiseBotProvider.tsx";
import { useFinancialState } from "../hooks/useFinancialState.ts";
import { enqueueLocalReminder } from "../pwa/reminderQueue.ts";
import { useReminders } from "../reminders/ReminderProvider.tsx";
import { Button } from "../components/ui/button.tsx";
import { DIAGNOSTICS_CHANGED_EVENT, repeatedLocalFault } from "../errors/diagnostics.ts";
import {
  canScheduleCoachNotification, COACH_FORM_FAULT_EVENT, decideCoachNudge, loadCoachHistory, loadCoachSettings,
  pauseAfterDismissals, recordCoachEvent, resetCoachHistory, saveCoachHistory, saveCoachSettings,
  type CoachHistory, type CoachNudge, type CoachSettings,
} from "./index.ts";

const BACKUP_MARKER_KEY = "wisemoney.coach.backup-created.v1";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COACH_CHANGED_EVENT = "wisemoney:coach-changed";

type CoachContextValue = {
  settings: CoachSettings;
  history: CoachHistory;
  notificationPermission: NotificationPermission | "unsupported";
  updateInApp: (enabled: boolean) => void;
  updateNotifications: (enabled: boolean) => Promise<void>;
  pause: () => void;
  reset: () => void;
};

const CoachContext = createContext<CoachContextValue | null>(null);

function permissionState(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function interactionBusy(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement ||
    active?.getAttribute("contenteditable") === "true" || document.querySelector('[role="dialog"]') != null;
}

export function markCoachBackupCreated(storage: Pick<Storage, "setItem"> = localStorage): void {
  try { storage.setItem(BACKUP_MARKER_KEY, String(Date.now())); } catch { /* This optional coach marker must not block an export. */ }
}

function hasBackupMarker(): boolean {
  try { return localStorage.getItem(BACKUP_MARKER_KEY) != null; } catch { return false; }
}

function CoachCard({ nudge, onLater, onDismiss, onHelp, onBot }: {
  nudge: CoachNudge;
  onLater: () => void;
  onDismiss: () => void;
  onHelp: () => void;
  onBot: () => void;
}) {
  const { i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("fr") ? "fr" : "en";
  const task = getProductTask(locale, nudge.taskId);
  if (task == null) return null;
  return (
    <aside
      aria-label={locale === "fr" ? "Conseil WiseBot" : "WiseBot tip"}
      className="fixed inset-x-3 bottom-[calc(4.75rem+var(--safe-area-bottom))] z-[80] border border-ocean-primary bg-card shadow-[0_12px_32px_rgba(16,24,32,0.16)] sm:left-auto sm:right-5 sm:w-[min(390px,calc(100vw-2rem))] lg:bottom-5"
    >
      <div className="grid grid-cols-[3.25rem_1fr_2.75rem] border-b border-border">
        <span className="flex items-center justify-center border-r border-border bg-ocean-primary text-white"><Bot className="h-5 w-5" /></span>
        <div className="min-w-0 px-3 py-2.5">
          <p className="text-xs font-semibold text-ocean-primary">{locale === "fr" ? "Besoin d’aide ?" : "Need help?"}</p>
          <h2 className="mt-0.5 text-sm font-bold leading-tight">{task.title}</h2>
        </div>
        <button type="button" onClick={onDismiss} className="flex items-center justify-center border-l border-border" aria-label={locale === "fr" ? "Fermer ce conseil" : "Dismiss this tip"}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{task.summary}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="justify-start" onClick={onHelp}><BookOpen className="h-4 w-4" />{locale === "fr" ? "Voir les étapes" : "View steps"}</Button>
          <Button type="button" className="justify-start" onClick={onBot}><Bot className="h-4 w-4" />{locale === "fr" ? "Demander à WiseBot" : "Ask WiseBot"}</Button>
        </div>
        <button type="button" onClick={onLater} className="mt-3 text-xs font-medium text-muted-foreground underline underline-offset-4">
          {locale === "fr" ? "Plus tard" : "Later"}
        </button>
      </div>
    </aside>
  );
}

export function CoachProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: snapshot } = useFinancialState();
  const reminders = useReminders();
  const wiseBot = useWiseBot();
  const sessionStartedAt = useRef(Date.now());
  const [settings, setSettings] = useState(loadCoachSettings);
  const [history, setHistory] = useState(loadCoachHistory);
  const [notificationPermission, setNotificationPermission] = useState(permissionState);
  const [ready, setReady] = useState(false);
  const [sessionNudgeShown, setSessionNudgeShown] = useState(false);
  const [nudge, setNudge] = useState<CoachNudge | null>(null);
  const [milestones, setMilestones] = useState({ hasTransaction: false, hasTransfer: false });
  const [repeatedFaultCode, setRepeatedFaultCode] = useState(repeatedLocalFault);
  const [repeatedTaskId, setRepeatedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setReady(true), Math.max(0, 20_000 - (Date.now() - sessionStartedAt.current)));
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const receiveFormFault = (event: Event) => {
      const taskId = (event as CustomEvent<{ taskId?: unknown }>).detail?.taskId;
      if (typeof taskId === "string") setRepeatedTaskId(taskId);
    };
    window.addEventListener(COACH_FORM_FAULT_EVENT, receiveFormFault);
    return () => window.removeEventListener(COACH_FORM_FAULT_EVENT, receiveFormFault);
  }, []);

  useEffect(() => {
    const refreshFault = () => setRepeatedFaultCode(repeatedLocalFault());
    window.addEventListener(DIAGNOSTICS_CHANGED_EVENT, refreshFault);
    return () => window.removeEventListener(DIAGNOSTICS_CHANGED_EVENT, refreshFault);
  }, []);

  useEffect(() => {
    if (snapshot == null) return;
    let active = true;
    void Promise.all([
      db.financialEvents.where("type").equals("transaction_created").count(),
      db.financialEvents.where("type").equals("transfer_created").count(),
    ]).then(([transactions, transfers]) => {
      if (active) setMilestones({ hasTransaction: transactions > 0, hasTransfer: transfers > 0 });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [snapshot?.asOfEventId]);

  useEffect(() => {
    const refresh = () => setNotificationPermission(permissionState());
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  useEffect(() => {
    if (!ready || snapshot == null || nudge != null) return;
    const now = Date.now();
    const planningUsed = snapshot.budgets.length + snapshot.goals.length + snapshot.plannedExpenses.length +
      snapshot.recurringItems.length + snapshot.debtCredits.length > 0;
    const hasDatedItems = snapshot.plannedExpenses.some((item) => item.status === "pending" && item.dueDate != null) ||
      snapshot.recurringItems.some((item) => !item.isArchived) || snapshot.debtCredits.some((item) => item.status !== "settled" && item.dueDate != null);
    const decision = decideCoachNudge({
      locale: (i18n.resolvedLanguage ?? i18n.language).startsWith("fr") ? "fr" : "en",
      surfaceId: surfaceFromPathname(pathname),
      sessionStartedAt: sessionStartedAt.current,
      sessionNudgeShown,
      interactionBusy: interactionBusy(),
      wiseBotOpen: wiseBot.isOpen,
      accountCount: snapshot.accounts.filter((account) => account.isActive).length,
      hasTransaction: milestones.hasTransaction,
      hasTransfer: milestones.hasTransfer,
      planningUsed,
      remindersEnabled: reminders.settings.enabled,
      hasDatedItems,
      backupCreated: hasBackupMarker(),
      repeatedFaultCode,
      repeatedTaskId,
    }, settings, history, now);
    if (decision.kind !== "show") return;
    const nextHistory = recordCoachEvent(history, decision.nudge.id, "shown", now);
    setHistory(saveCoachHistory(nextHistory));
    setSessionNudgeShown(true);
    setNudge(decision.nudge);
    if (decision.nudge.kind === "recovery") setRepeatedTaskId(null);
  }, [history, i18n.language, i18n.resolvedLanguage, milestones, nudge, pathname, ready, reminders.settings.enabled, repeatedFaultCode, repeatedTaskId, sessionNudgeShown, settings, snapshot, wiseBot.isOpen]);

  useEffect(() => {
    if (nudge == null || !canScheduleCoachNotification(settings, history) || notificationPermission !== "granted") return;
    const now = Date.now();
    const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("fr") ? "fr" : "en";
    const task = getProductTask(locale, nudge.taskId);
    if (task == null) return;
    const week = Math.floor(now / WEEK_MS);
    void enqueueLocalReminder({
      kind: "coach",
      id: `coach:${nudge.id}:${week}`,
      label: task.summary.slice(0, 120),
      triggerAt: now + WEEK_MS,
      expiresAt: now + WEEK_MS + 2 * 24 * 60 * 60 * 1000,
      locale,
      href: `/help?coachTip=${encodeURIComponent(task.id)}#${encodeURIComponent(task.id)}`,
    }).then(() => {
      setHistory((current) => saveCoachHistory(recordCoachEvent(current, nudge.id, "notification_delivered", now)));
    }).catch(() => undefined);
  }, [history, i18n.language, i18n.resolvedLanguage, notificationPermission, nudge, settings]);

  const recordAndClose = useCallback((type: "later" | "dismissed" | "help_opened" | "bot_opened") => {
    if (nudge == null) return;
    const now = Date.now();
    const nextHistory = recordCoachEvent(history, nudge.id, type, now);
    setHistory(saveCoachHistory(nextHistory));
    if (type === "dismissed") setSettings(saveCoachSettings(pauseAfterDismissals(settings, nextHistory, now)));
    setNudge(null);
    window.dispatchEvent(new Event(COACH_CHANGED_EVENT));
  }, [history, nudge, settings]);

  const updateInApp = useCallback((enabled: boolean) => setSettings((current) => saveCoachSettings({ ...current, inAppEnabled: enabled })), []);
  const updateNotifications = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      setSettings((current) => saveCoachSettings({ ...current, notificationsEnabled: false }));
      return;
    }
    if (typeof Notification === "undefined") { setNotificationPermission("unsupported"); return; }
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    setSettings((current) => saveCoachSettings({ ...current, notificationsEnabled: result === "granted" }));
  }, []);
  const pause = useCallback(() => setSettings((current) => saveCoachSettings({ ...current, pausedUntil: Date.now() + 14 * 24 * 60 * 60 * 1000 })), []);
  const reset = useCallback(() => {
    const next = resetCoachHistory();
    setHistory(saveCoachHistory(next));
    setSettings((current) => saveCoachSettings({ ...current, pausedUntil: null }));
  }, []);

  const value = useMemo(() => ({ settings, history, notificationPermission, updateInApp, updateNotifications, pause, reset }),
    [history, notificationPermission, pause, reset, settings, updateInApp, updateNotifications]);

  return (
    <CoachContext.Provider value={value}>
      {children}
      {nudge != null && <CoachCard
        nudge={nudge}
        onLater={() => recordAndClose("later")}
        onDismiss={() => recordAndClose("dismissed")}
        onHelp={() => { recordAndClose("help_opened"); openHelp(nudge.taskId); }}
        onBot={() => {
          recordAndClose("bot_opened");
          wiseBot.openWiseBot({ entryPoint: "coach", surfaceId: surfaceFromPathname(pathname), taskId: nudge.taskId });
        }}
      />}
    </CoachContext.Provider>
  );
}

export function useCoach(): CoachContextValue {
  const value = useContext(CoachContext);
  if (value == null) throw new Error("useCoach must be used within CoachProvider");
  return value;
}
