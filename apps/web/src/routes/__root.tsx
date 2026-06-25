import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { BookOpenCheck, CheckCircle2, HelpCircle, LayoutDashboard, MessageSquare, PlusCircle, ClipboardList, Settings as SettingsIcon } from "lucide-react";
import Logo from "../components/Logo.tsx";
import { Button } from "../components/ui/button.tsx";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet.tsx";
import { useTranslation } from "react-i18next";

const navItems = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/capture", labelKey: "nav.capture", icon: PlusCircle, exact: false },
  { to: "/assistant", labelKey: "nav.assistant", icon: MessageSquare, exact: false },
  { to: "/planning", labelKey: "nav.planning", icon: ClipboardList, exact: false },
  { to: "/settings", labelKey: "nav.settings", icon: SettingsIcon, exact: false },
] as const;

const journeySteps = [
  { titleKey: "helpCenter.journey.accounts.title", bodyKey: "helpCenter.journey.accounts.body", to: "/capture" },
  { titleKey: "helpCenter.journey.capture.title", bodyKey: "helpCenter.journey.capture.body", to: "/capture" },
  { titleKey: "helpCenter.journey.planning.title", bodyKey: "helpCenter.journey.planning.body", to: "/planning" },
  { titleKey: "helpCenter.journey.dashboard.title", bodyKey: "helpCenter.journey.dashboard.body", to: "/" },
  { titleKey: "helpCenter.journey.services.title", bodyKey: "helpCenter.journey.services.body", to: "/settings" },
] as const;

const faqItems = [
  { questionKey: "helpCenter.faq.account.question", answerKey: "helpCenter.faq.account.answer" },
  { questionKey: "helpCenter.faq.expense.question", answerKey: "helpCenter.faq.expense.answer" },
  { questionKey: "helpCenter.faq.offline.question", answerKey: "helpCenter.faq.offline.answer" },
  { questionKey: "helpCenter.faq.assistant.question", answerKey: "helpCenter.faq.assistant.answer" },
  { questionKey: "helpCenter.faq.sync.question", answerKey: "helpCenter.faq.sync.answer" },
] as const;

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 md:px-5">
          <Link to="/" className="flex items-center gap-3">
            <Logo className="h-7 w-auto" />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
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
          <div className="h-7 w-7 md:hidden" aria-hidden="true" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-20 pt-4 md:px-6 md:pb-8 md:pt-6">
        <div className="mx-auto w-full max-w-7xl">
          <Outlet />
        </div>
      </main>

      <HelpCenter />

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/94 shadow-[0_-8px_24px_rgba(16,24,32,0.08)] backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "var(--safe-area-bottom)" }}
      >
        <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex h-full min-w-16 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-muted-foreground transition-[background-color,color,transform] duration-200 active:scale-95"
              activeProps={{ className: "text-ocean-dark bg-ocean-wash/80" }}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] leading-tight font-medium">
                {t(item.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

function HelpCenter() {
  const { t } = useTranslation();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="icon"
          className="fixed bottom-20 right-4 z-40 h-11 w-11 rounded-full shadow-lg md:bottom-6"
          aria-label={t("helpCenter.open")}
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[92vw] max-w-md flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-ocean-primary" />
            {t("helpCenter.title")}
          </SheetTitle>
          <SheetDescription>
            {t("helpCenter.description")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-3">
          {journeySteps.map((step, index) => (
            <SheetClose key={step.titleKey} asChild>
              <Link
                to={step.to}
                className="interactive-surface block rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-sm font-semibold text-ocean-dark tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t(step.titleKey)}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(step.bodyKey)}</p>
                  </div>
                </div>
              </Link>
            </SheetClose>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3">
            <p className="text-sm font-semibold">{t("helpCenter.faqTitle")}</p>
          </div>
          <div className="divide-y divide-border">
            {faqItems.map((item) => (
              <details key={item.questionKey} className="group p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                  {t(item.questionKey)}
                  <HelpCircle className="h-4 w-4 shrink-0 text-ocean-primary" />
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t(item.answerKey)}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-border bg-accent/55 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ocean-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("helpCenter.installNote")}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
