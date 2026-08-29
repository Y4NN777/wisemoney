import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, MessageSquare, PlusCircle, ClipboardList, Settings as SettingsIcon } from "lucide-react";
import Logo from "../components/Logo.tsx";
import HelpActions from "../components/HelpActions.tsx";
import LanguageSwitcher from "../components/LanguageSwitcher.tsx";
import { useTranslation } from "react-i18next";
import ReminderCenter, { type ReminderViewModel } from "../components/ReminderCenter.tsx";
import { ReminderProvider, useReminders } from "../reminders/ReminderProvider.tsx";
import { CoachProvider } from "../coach/CoachProvider.tsx";

const navItems = [
  { to: "/", labelKey: "nav.dashboard", compactLabelKey: "nav.dashboardShort", icon: LayoutDashboard, exact: true },
  { to: "/capture", labelKey: "nav.capture", compactLabelKey: "nav.capture", icon: PlusCircle, exact: false },
  { to: "/assistant", labelKey: "nav.assistant", compactLabelKey: "nav.assistant", icon: MessageSquare, exact: false },
  { to: "/planning", labelKey: "nav.planning", compactLabelKey: "nav.planning", icon: ClipboardList, exact: false },
  { to: "/settings", labelKey: "nav.settings", compactLabelKey: "nav.settings", icon: SettingsIcon, exact: false },
] as const;

export const Route = createRootRoute({
  component: RootWithReminders,
});

function RootWithReminders() {
  return <ReminderProvider><CoachProvider><RootLayout /></CoachProvider></ReminderProvider>;
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

function RootLayout() {
  const { t } = useTranslation();
  const navigate = Route.useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { reminders, markRead, dismiss } = useReminders();
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
          <Link to="/" className="flex items-center gap-3">
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
          </nav>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1 sm:gap-2">
            <ReminderCenter reminders={reminderViews} onMarkRead={markRead} onDismiss={dismiss} onOpenReminder={openReminder} />
            <HelpActions compact />
            <LanguageSwitcher compact />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-20 pt-4 md:px-6 md:pt-6 lg:pb-8">
        <div key={pathname} className="route-transition mx-auto w-full max-w-7xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label={t("nav.primaryAria")}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/94 shadow-[0_-8px_24px_rgba(16,24,32,0.08)] backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "var(--safe-area-bottom)" }}
      >
        <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-label={t(item.labelKey)}
              activeOptions={{ exact: item.exact }}
              className="flex h-full min-w-16 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-muted-foreground transition-[background-color,color,transform] duration-200 active:scale-95"
              activeProps={{ className: "text-ocean-dark bg-ocean-wash/80" }}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[11px] leading-tight font-medium">
                {t(item.compactLabelKey)}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
