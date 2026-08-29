import { BellRing, Bot, Pause, RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCoach } from "../coach/CoachProvider.tsx";
import { Button } from "./ui/button.tsx";

function SettingToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full border border-border bg-muted transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4.5 after:w-4.5 after:rounded-full after:bg-card after:shadow-sm after:transition-transform peer-checked:border-ocean-primary peer-checked:bg-ocean-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}

export default function CoachSettingsSection() {
  const { t } = useTranslation();
  const coach = useCoach();
  return (
    <div className="space-y-4">
      <section className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <SettingToggle checked={coach.settings.inAppEnabled} label={t("coach.settings.inApp")} onChange={coach.updateInApp} />
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("coach.settings.inAppHelp")}</p>
        </div>
        <Bot className="h-5 w-5 text-ocean-primary" />
      </section>
      <section className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <SettingToggle checked={coach.settings.notificationsEnabled} label={t("coach.settings.notifications")} onChange={(enabled) => { void coach.updateNotifications(enabled); }} />
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("coach.settings.notificationsHelp")}</p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-ocean-primary" />
          {t(`coach.settings.permission.${coach.notificationPermission}`)}
        </span>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={coach.pause}><Pause className="h-4 w-4" />{t("coach.settings.pause")}</Button>
        <Button type="button" variant="outline" onClick={coach.reset}><RotateCcw className="h-4 w-4" />{t("coach.settings.reset")}</Button>
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-ocean-primary" />{t("coach.settings.privacy")}
      </p>
    </div>
  );
}
