import { useMemo, useState } from "react";
import { Bell, CalendarClock, Check, ChevronRight, CircleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import type { ReminderType } from "../reminders/index.ts";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet.tsx";

export type ReminderViewModel = {
  id: string;
  type: ReminderType;
  label: string;
  dueAt: number | null;
  read: boolean;
  urgency: "info" | "upcoming" | "today" | "overdue";
};

type ReminderCenterProps = {
  reminders: ReminderViewModel[];
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onOpenReminder: (reminder: ReminderViewModel) => void;
};

function urgencyClass(urgency: ReminderViewModel["urgency"]): string {
  if (urgency === "overdue") return "border-destructive/35 bg-destructive/5 text-destructive";
  if (urgency === "today") return "border-amber/45 bg-amber/10 text-foreground";
  if (urgency === "upcoming") return "border-ocean-primary/25 bg-ocean-wash/65 text-ocean-dark";
  return "border-border bg-accent/45 text-foreground";
}

export default function ReminderCenter({ reminders, onMarkRead, onDismiss, onOpenReminder }: ReminderCenterProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const unreadCount = reminders.filter((reminder) => !reminder.read).length;
  const ordered = useMemo(
    () => [...reminders].sort((left, right) => (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER)),
    [reminders],
  );

  const openReminder = (reminder: ReminderViewModel) => {
    onMarkRead(reminder.id);
    setOpen(false);
    onOpenReminder(reminder);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("reminders.center.open", { count: unreadCount })}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-ocean-primary px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full max-w-md flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-5 pr-12">
          <SheetTitle>{t("reminders.center.title")}</SheetTitle>
          <SheetDescription>{t("reminders.center.description")}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {ordered.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-ocean-wash text-ocean-primary">
                <Check className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{t("reminders.center.emptyTitle")}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("reminders.center.emptyBody")}</p>
              </div>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {ordered.map((reminder) => (
                <li key={reminder.id} className={reminder.read ? "opacity-70" : undefined}>
                  <article className="group relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 px-5 py-4 hover:bg-accent/45">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-md border ${urgencyClass(reminder.urgency)}`}>
                      {reminder.urgency === "overdue" || reminder.urgency === "today" ? (
                        <CircleAlert className="h-4 w-4" />
                      ) : (
                        <CalendarClock className="h-4 w-4" />
                      )}
                    </span>
                    <button type="button" className="min-w-0 text-left" onClick={() => openReminder(reminder)}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">{t(`reminders.types.${reminder.type}`)}</span>
                        {!reminder.read && <span className="h-1.5 w-1.5 rounded-full bg-ocean-primary" aria-label={t("reminders.center.unread")} />}
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold text-foreground">{reminder.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {reminder.dueAt == null
                          ? t("reminders.center.noDate")
                          : new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(reminder.dueAt)}
                      </span>
                    </button>
                    <div className="flex items-center gap-1 self-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onDismiss(reminder.id)}
                        aria-label={t("reminders.center.dismiss", { label: reminder.label })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openReminder(reminder)}
                        aria-label={t("reminders.center.view", { label: reminder.label })}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="border-t border-border bg-accent/35 px-5 py-3">
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {t("reminders.center.localOnly")}
          </Badge>
        </div>
      </SheetContent>
    </Sheet>
  );
}
