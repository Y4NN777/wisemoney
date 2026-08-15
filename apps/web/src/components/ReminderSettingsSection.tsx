import { BellRing, CalendarPlus, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReminderSettings, ReminderType } from "../reminders/index.ts";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";

export type NotificationPermissionState = NotificationPermission | "unsupported";

type ReminderSettingsSectionProps = {
  settings: ReminderSettings;
  permission: NotificationPermissionState;
  onChange: (settings: ReminderSettings) => void;
  onRequestPermission: () => Promise<void>;
  onTestNotification: () => Promise<void>;
  onExportWeeklyCalendar: () => void;
};

const DATED_TYPES: ReminderType[] = ["planned_expense", "recurring_item", "debt_due", "receivable_due"];

function SettingToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-6 w-11 shrink-0 rounded-full border border-border bg-muted transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4.5 after:w-4.5 after:rounded-full after:bg-card after:shadow-sm after:transition-transform peer-checked:border-ocean-primary peer-checked:bg-ocean-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}

function parseLeadDays(value: string, fallback: number[]): number[] {
  const days = [...new Set(value.split(",").map((part) => Number(part.trim())).filter((day) => Number.isSafeInteger(day) && day >= 0 && day <= 365))]
    .sort((left, right) => right - left);
  return days.length === 0 ? fallback : days;
}

export default function ReminderSettingsSection({
  settings,
  permission,
  onChange,
  onRequestPermission,
  onTestNotification,
  onExportWeeklyCalendar,
}: ReminderSettingsSectionProps) {
  const { t } = useTranslation();

  const updateType = (type: ReminderType, patch: Partial<ReminderSettings["types"][ReminderType]>) => {
    onChange({
      ...settings,
      types: {
        ...settings.types,
        [type]: { ...settings.types[type], ...patch },
      },
    });
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <SettingToggle
            checked={settings.enabled}
            label={t("reminders.settings.enable")}
            onChange={(enabled) => onChange({ ...settings, enabled })}
          />
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("reminders.settings.privacy")}</p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-ocean-primary" />
          {t(`reminders.settings.permission.${permission}`)}
        </span>
      </section>

      <section aria-label={t("reminders.settings.typesTitle")} className="divide-y divide-border border border-border bg-card">
        {(Object.keys(settings.types) as ReminderType[]).map((type) => (
          <div key={type} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,14rem)] sm:items-center">
            <div>
              <SettingToggle
                checked={settings.types[type].enabled}
                label={t(`reminders.types.${type}`)}
                onChange={(enabled) => updateType(type, { enabled })}
              />
              <p className="mt-1 pl-14 text-xs leading-relaxed text-muted-foreground">{t(`reminders.settings.typeHelp.${type}`)}</p>
            </div>
            {DATED_TYPES.includes(type) && (
              <div>
                <Label htmlFor={`reminder-lead-${type}`} className="text-xs">{t("reminders.settings.leadDays")}</Label>
                <Input
                  id={`reminder-lead-${type}`}
                  inputMode="numeric"
                  defaultValue={settings.types[type].leadDays.join(", ")}
                  onBlur={(event) => updateType(type, { leadDays: parseLeadDays(event.target.value, settings.types[type].leadDays) })}
                  aria-describedby={`reminder-lead-help-${type}`}
                  className="mt-1 h-9"
                />
                <p id={`reminder-lead-help-${type}`} className="mt-1 text-[11px] text-muted-foreground">{t("reminders.settings.leadDaysHelp")}</p>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="reminder-weekday">{t("reminders.settings.weekday")}</Label>
          <Select
            value={String(settings.weeklyReview.weekday)}
            onValueChange={(value) => onChange({ ...settings, weeklyReview: { ...settings.weeklyReview, weekday: Number(value) } })}
          >
            <SelectTrigger id="reminder-weekday" className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
                <SelectItem key={weekday} value={String(weekday)}>{t(`reminders.settings.weekdays.${weekday}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="reminder-hour">{t("reminders.settings.hour")}</Label>
          <Input
            id="reminder-hour"
            type="time"
            value={`${String(settings.weeklyReview.hour).padStart(2, "0")}:00`}
            onChange={(event) => onChange({ ...settings, weeklyReview: { ...settings.weeklyReview, hour: Number(event.target.value.slice(0, 2)) } })}
            className="mt-1"
          />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">{t("reminders.settings.thresholds")}</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {([70, 90, 100] as const).map((threshold) => (
              <label key={threshold} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.budgetThresholds.includes(threshold)}
                  onChange={(event) => {
                    const budgetThresholds = event.target.checked
                      ? [...settings.budgetThresholds, threshold].sort((left, right) => left - right)
                      : settings.budgetThresholds.filter((value) => value !== threshold);
                    onChange({ ...settings, budgetThresholds });
                  }}
                />
                {threshold} %
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <div className="flex flex-wrap gap-2">
        {permission !== "granted" && permission !== "unsupported" && (
          <Button type="button" onClick={() => void onRequestPermission()}>
            <BellRing className="h-4 w-4" />
            {t("reminders.settings.allowSystem")}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={permission !== "granted"} onClick={() => void onTestNotification()}>
          <BellRing className="h-4 w-4" />
          {t("reminders.settings.test")}
        </Button>
        <Button type="button" variant="outline" onClick={onExportWeeklyCalendar}>
          <CalendarPlus className="h-4 w-4" />
          {t("reminders.settings.exportCalendar")}
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("reminders.settings.bestEffort")}</p>
    </div>
  );
}
