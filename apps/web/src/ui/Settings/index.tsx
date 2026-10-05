import ExportImportSection from "../ExportImport/index.tsx";
import BYOKeySettings from "../BYOKeySettings/index.tsx";
import DevicesSection from "./DevicesSection.tsx";
import CurrencySection from "./CurrencySection.tsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.tsx";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, BellRing, Bot, ChevronRight, Coins, DatabaseBackup, Download, Info, Languages, ShieldCheck, Sparkles, SunMoon, WalletCards, type LucideIcon } from "lucide-react";
import ReminderSettingsSection from "../../components/ReminderSettingsSection.tsx";
import { useReminders } from "../../reminders/ReminderProvider.tsx";
import { Button } from "../../components/ui/button.tsx";
import { openUpdates } from "../../releases/navigation.ts";
import { PRODUCT_VERSION } from "../../releases/releaseNotes.ts";
import ThemeSettings from "../../components/ThemeSettings.tsx";
import { useInstallAction } from "../../components/HelpActions.tsx";
import CoachSettingsSection from "../../components/CoachSettingsSection.tsx";
import { useFinancialState } from "../../hooks/useFinancialState.ts";
import { ManagementSections } from "../Capture/ManagementSections.tsx";
import type { ManageSection } from "../../routes/capture.tsx";
import { Route as SettingsRoute, parseSettingsSearch, type SettingsPanelId } from "../../routes/settings.tsx";

function AccountsCategoriesSection({ initialSection = "accounts" }: { initialSection?: ManageSection }) {
  const { t } = useTranslation();
  const { data: snapshot } = useFinancialState();
  const [section, setSection] = useState<ManageSection>(initialSection);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-muted" role="tablist" aria-label={t("capture.manage.sectionsLabel")}>
        {(["accounts", "categories"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={section === candidate}
            onClick={() => setSection(candidate)}
            className={`min-h-12 border-primary px-4 text-left text-sm font-semibold transition-colors first:border-r ${section === candidate ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-muted"}`}
          >
            {t(`capture.manage.${candidate}`)}
          </button>
        ))}
      </div>
      {snapshot != null && <ManagementSections snapshot={snapshot} section={section} />}
    </div>
  );
}

type SectionId = Exclude<SettingsPanelId, "categories">;

/** The sections of Settings, in list order. Each opens alone on its own screen (`?panel=<id>`). */
const SECTIONS: readonly { id: SectionId; icon: LucideIcon; titleKey: string }[] = [
  { id: "accounts", icon: WalletCards, titleKey: "settings.sections.organization.title" },
  { id: "money", icon: Coins, titleKey: "settings.sections.money.title" },
  { id: "reminders", icon: BellRing, titleKey: "settings.sections.reminders.title" },
  { id: "security", icon: ShieldCheck, titleKey: "settings.sections.security.title" },
  { id: "data", icon: DatabaseBackup, titleKey: "settings.sections.data.title" },
  { id: "tips", icon: Bot, titleKey: "settings.sections.coach.title" },
  { id: "assistant", icon: Sparkles, titleKey: "settings.sections.ai.title" },
  { id: "about", icon: Info, titleKey: "settings.about.title" },
];

function RemindersSection() {
  const reminders = useReminders();
  return (
    <ReminderSettingsSection
      settings={reminders.settings}
      permission={reminders.permission}
      onChange={reminders.updateSettings}
      onRequestPermission={reminders.requestPermission}
      onTestNotification={reminders.testNotification}
      onExportWeeklyCalendar={reminders.exportWeeklyCalendar}
    />
  );
}

function AssistantSection() {
  const { t } = useTranslation();
  return (
    <>
      <Button asChild variant="outline" className="mb-4 w-full gap-2 sm:w-auto">
        <Link to="/assistant">
          <Bot className="h-4 w-4" />
          {t("settings.sections.ai.openAssistant")}
        </Link>
      </Button>
      <BYOKeySettings />
    </>
  );
}

function AboutSection() {
  const { t } = useTranslation();
  const install = useInstallAction();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("settings.about.version", { version: PRODUCT_VERSION })}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {!install.installed && (
          <Button type="button" variant="outline" className="gap-2" onClick={install.run}>
            <Download className="h-4 w-4" />
            {t("settings.about.install")}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => openUpdates(PRODUCT_VERSION)}>
          {t("settings.about.action")}
        </Button>
      </div>
    </div>
  );
}

function SectionBody({ panel }: { panel: SettingsPanelId }) {
  switch (panel) {
    case "accounts":
    case "categories":
      return <AccountsCategoriesSection initialSection={panel} />;
    case "money":
      return <CurrencySection />;
    case "reminders":
      return <RemindersSection />;
    case "security":
      return <DevicesSection />;
    case "data":
      return <ExportImportSection />;
    case "tips":
      return <CoachSettingsSection />;
    case "assistant":
      return <AssistantSection />;
    case "about":
      return <AboutSection />;
  }
}

/**
 * Settings is a short list: language and appearance inline (one control each), then one row per
 * section. A row opens that section alone, with a way back; nothing else is on the screen
 * (UX audit 2026-10: the former single page held 83 controls).
 */
export default function Settings() {
  const { t } = useTranslation();
  // The route's search type is circular through the lazy component; re-parse like Operations does.
  const rawSearch: unknown = SettingsRoute.useSearch();
  const { panel } = parseSettingsSearch(typeof rawSearch === "object" && rawSearch != null ? rawSearch as Record<string, unknown> : {});

  if (panel != null) {
    const section = SECTIONS.find((candidate) => candidate.id === (panel === "categories" ? "accounts" : panel))!;
    return (
      <main aria-label={t(section.titleKey)} className="app-page max-w-4xl">
        <Link to="/settings" search={{}} className="interactive-surface -ml-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("settings.title")}
        </Link>
        <h1 className="page-title">{t(section.titleKey)}</h1>
        <div className="settings-section motion-enter">
          <SectionBody panel={panel} />
        </div>
      </main>
    );
  }

  return (
    <main aria-label={t("settings.title")} className="app-page max-w-4xl">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
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

      <section aria-label={t("settings.appearance.title")} className="motion-enter rounded-lg border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] sm:items-center">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
              <SunMoon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">{t("settings.appearance.title")}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("settings.appearance.description")}</p>
            </div>
          </div>
          <ThemeSettings />
        </div>
      </section>

      <nav aria-label={t("settings.sectionsAria")} className="motion-enter overflow-hidden rounded-lg border border-border bg-card">
        <ul className="divide-y divide-border">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <Link to="/settings" search={{ panel: section.id }} className="interactive-surface flex min-h-14 items-center gap-3 px-4 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
                  <section.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold">{t(section.titleKey)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
