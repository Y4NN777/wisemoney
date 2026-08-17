import ExportImportSection from "../ExportImport/index.tsx";
import BYOKeySettings from "../BYOKeySettings/index.tsx";
import DevicesSection from "./DevicesSection.tsx";
import CurrencySection from "./CurrencySection.tsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.tsx";
import { useTranslation } from "react-i18next";
import { BellRing, Bot, ChevronDown, Coins, DatabaseBackup, Languages, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import ReminderSettingsSection from "../../components/ReminderSettingsSection.tsx";
import { useReminders } from "../../reminders/ReminderProvider.tsx";
import { Button } from "../../components/ui/button.tsx";
import { openUpdates } from "../../releases/navigation.ts";
import { PRODUCT_VERSION } from "../../releases/releaseNotes.ts";

function SettingsPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-lg border border-border bg-card">
      <summary className="interactive-surface flex cursor-pointer list-none items-center gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border bg-background/45 p-3 sm:p-4">{children}</div>
    </details>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const reminders = useReminders();
  return (
    <main aria-label={t("settings.title")} className="app-page max-w-4xl">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.description")}</p>
        </div>
      </div>

      <section aria-label={t("settings.language.title")} className="motion-enter rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
              <Languages className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">{t("settings.language.title")}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("settings.language.description")}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </section>

      <div className="grid gap-3 motion-enter">
        <SettingsPanel
          icon={<BellRing className="h-5 w-5" />}
          title={t("settings.sections.reminders.title")}
          description={t("settings.sections.reminders.description")}
        >
          <ReminderSettingsSection
            settings={reminders.settings}
            permission={reminders.permission}
            onChange={reminders.updateSettings}
            onRequestPermission={reminders.requestPermission}
            onTestNotification={reminders.testNotification}
            onExportWeeklyCalendar={reminders.exportWeeklyCalendar}
          />
        </SettingsPanel>
        <SettingsPanel
          icon={<Coins className="h-5 w-5" />}
          title={t("settings.sections.money.title")}
          description={t("settings.sections.money.description")}
        >
          <CurrencySection />
        </SettingsPanel>
        <SettingsPanel
          icon={<DatabaseBackup className="h-5 w-5" />}
          title={t("settings.sections.data.title")}
          description={t("settings.sections.data.description")}
        >
          <ExportImportSection />
        </SettingsPanel>
        <SettingsPanel
          icon={<Bot className="h-5 w-5" />}
          title={t("settings.sections.ai.title")}
          description={t("settings.sections.ai.description")}
        >
          <BYOKeySettings />
        </SettingsPanel>
        <SettingsPanel
          icon={<ShieldCheck className="h-5 w-5" />}
          title={t("settings.sections.security.title")}
          description={t("settings.sections.security.description")}
        >
          <DevicesSection />
        </SettingsPanel>
      </div>

      <section aria-label={t("settings.about.title")} className="motion-enter border-t border-border pt-4">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">{t("settings.about.title")}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("settings.about.version", { version: PRODUCT_VERSION })}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => openUpdates(PRODUCT_VERSION)}>
            {t("settings.about.action")}
          </Button>
        </div>
      </section>
    </main>
  );
}
