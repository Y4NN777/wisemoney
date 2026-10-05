import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CircleHelp, LayoutDashboard, ListOrdered, PlusCircle, ClipboardList, Settings as SettingsIcon } from "lucide-react";
import CaptureSheet, { useOpenCaptureSheet } from "../components/CaptureSheet/index.tsx";
import Logo from "../components/Logo.tsx";
import { Skeleton } from "../components/ui/skeleton.tsx";
import { useHideWiseBotLauncher, useWiseBot } from "../help/WiseBotProvider.tsx";
import { surfaceFromPathname } from "../help/context.ts";
import { Fragment, Suspense } from "react";
import { useTranslation } from "react-i18next";
import ReminderCenter, { type ReminderViewModel } from "../components/ReminderCenter.tsx";
import { ReminderProvider, useReminders } from "../reminders/ReminderProvider.tsx";
import { CoachProvider } from "../coach/CoachProvider.tsx";

/**
 * The unlocked application: providers, header, bottom navigation and the capture sheet. Loaded
 * as its own chunk by the vault layout route, so the landing page does not pay for it.
 */
export default function VaultShell() {
  return (
    <ReminderProvider>
      <CoachProvider>
        <RootLayout />
        <CaptureSheet />
      </CoachProvider>
    </ReminderProvider>
  );
}

function reminderUrgency(type: ReminderViewModel["type"], dueAt: number, now = Date.now()): ReminderViewModel["urgency"] {
  if (type === "weekly_review" || type === "budget_threshold") return "info";
  const due = new Date(dueAt);
  const today = new Date(now);
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  if (due.getTime() < today.getTime()) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

/** The capture control: a raised centre button in the bottom bar, a plain button on desktop. */
function CaptureNavItem({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const openCapture = useOpenCaptureSheet();
  return (
    <button
      type="button"
      aria-label={t("nav.capture")}
      onClick={() => openCapture("transaction")}
      className={compact
        ? "flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 active:scale-95"
        : "interactive-surface flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"}
    >
      <PlusCircle className={compact ? "h-7 w-7" : "h-4 w-4"} />
      <span className={compact ? "sr-only" : ""}>{t("nav.capture")}</span>
    </button>
  );
}

function RootLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { reminders, markRead, dismiss } = useReminders();
  const wiseBot = useWiseBot();
  // Inside the app WiseBot opens from the header's help button; the floating launcher, which
  // sat over page content, is kept for the screens without a header (landing, unlock, help).
  useHideWiseBotLauncher();
  const reminderViews: ReminderViewModel[] = reminders.map((reminder) => ({
    id: reminder.id,
    type: reminder.type,
    label: reminder.label,
    dueAt: reminder.dueAt,
    read: reminder.readAt != null,
    urgency: reminderUrgency(reminder.type, reminder.dueAt),
  }));

  const openReminder = (reminder: ReminderViewModel) => {
    if (reminder.type === "planned_expense") void navigate({ to: "/planned-expenses" });
    else if (reminder.type === "recurring_item") void navigate({ to: "/recurring" });
    else if (reminder.type === "budget_threshold") void navigate({ to: "/budgets" });
    else if (reminder.type === "debt_due" || reminder.type === "receivable_due") void navigate({ to: "/debts" });
    else void navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center justify-between gap-1 px-2 py-2 sm:px-5">
          <Link to="/" className="flex min-h-11 items-center gap-3">
            <Logo className="h-7 w-auto" />
          </Link>
          <nav aria-label={t("nav.mainAria")} className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="interactive-surface flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground"
                activeProps={{ className: "bg-ocean-wash text-ocean-dark shadow-sm" }}
              >
                <item.icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            ))}
            <CaptureNavItem />
          </nav>
          <div className="ml-auto flex items-center justify-end gap-1">
            <ReminderCenter reminders={reminderViews} onMarkRead={markRead} onDismiss={dismiss} onOpenReminder={openReminder} />
            <button
              type="button"
              onClick={() => wiseBot.openWiseBot({ entryPoint: "manual", surfaceId: surfaceFromPathname(pathname) })}
              aria-label={t("helpPage.chat.open")}
              title={t("helpPage.chat.open")}
              className="interactive-surface flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground"
            >
              <CircleHelp className="h-5 w-5" />
            </button>
            <Link
              to="/settings"
              aria-label={t("nav.settings")}
              title={t("nav.settings")}
              className="interactive-surface flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground"
              activeProps={{ className: "bg-ocean-wash text-ocean-dark" }}
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-[calc(5rem+var(--safe-area-bottom))] pt-4 md:px-6 md:pt-6 lg:pb-8">
        <div key={pathname} className="route-transition mx-auto w-full max-w-7xl">
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label={t("nav.primaryAria")}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/94 shadow-[0_-8px_24px_rgba(16,24,32,0.08)] backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "var(--safe-area-bottom)" }}
      >
        <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
          {navItems.map((item, index) => (
            <Fragment key={item.to}>
              {index === CAPTURE_SLOT_INDEX && <CaptureNavItem compact />}
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex h-full min-w-16 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-muted-foreground transition-[background-color,color,transform] duration-200 active:scale-95"
                activeProps={{ className: "text-ocean-dark bg-ocean-wash/80" }}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-xs leading-tight font-medium">
                  {t(item.compactLabelKey)}
                </span>
              </Link>
            </Fragment>
          ))}
        </div>
      </nav>
    </div>
  );
}

// Three destinations (ux-simplification decision 1); capture is a button, not a route,
// rendered in the bottom bar before the item at CAPTURE_SLOT_INDEX. Settings lives in the header.
const navItems = [
  { to: "/", labelKey: "nav.dashboard", compactLabelKey: "nav.dashboardShort", icon: LayoutDashboard, exact: true },
  { to: "/operations", labelKey: "nav.activity", compactLabelKey: "nav.activity", icon: ListOrdered, exact: false },
  { to: "/planning", labelKey: "nav.plan", compactLabelKey: "nav.plan", icon: ClipboardList, exact: false },
] as const;
const CAPTURE_SLOT_INDEX = 2;
