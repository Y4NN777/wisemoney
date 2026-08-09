import { Link } from "@tanstack/react-router";
import { BookOpenCheck, CheckCircle2, Download, HelpCircle, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "./ui/button.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet.tsx";
import { OPEN_HELP_CENTER_EVENT, type HelpCenterSection } from "./helpCenterEvents.ts";

const journeySteps = [
  { titleKey: "helpCenter.journey.accounts.title", bodyKey: "helpCenter.journey.accounts.body", to: "/capture", tab: "manage" },
  { titleKey: "helpCenter.journey.capture.title", bodyKey: "helpCenter.journey.capture.body", to: "/capture", tab: "transaction" },
  { titleKey: "helpCenter.journey.planning.title", bodyKey: "helpCenter.journey.planning.body", to: "/planning", tab: undefined },
  { titleKey: "helpCenter.journey.dashboard.title", bodyKey: "helpCenter.journey.dashboard.body", to: "/", tab: undefined },
  { titleKey: "helpCenter.journey.services.title", bodyKey: "helpCenter.journey.services.body", to: "/settings", tab: undefined },
] as const;

const faqItems = [
  { questionKey: "helpCenter.faq.account.question", answerKey: "helpCenter.faq.account.answer" },
  { questionKey: "helpCenter.faq.expense.question", answerKey: "helpCenter.faq.expense.answer" },
  { questionKey: "helpCenter.faq.offline.question", answerKey: "helpCenter.faq.offline.answer" },
  { questionKey: "helpCenter.faq.assistant.question", answerKey: "helpCenter.faq.assistant.answer" },
  { questionKey: "helpCenter.faq.sync.question", answerKey: "helpCenter.faq.sync.answer" },
] as const;

const financialTerms = [
  { titleKey: "helpCenter.figures.signs.title", bodyKey: "helpCenter.figures.signs.body" },
  { titleKey: "helpCenter.figures.balance.title", bodyKey: "helpCenter.figures.balance.body" },
  { titleKey: "helpCenter.figures.income.title", bodyKey: "helpCenter.figures.income.body" },
  { titleKey: "helpCenter.figures.expenses.title", bodyKey: "helpCenter.figures.expenses.body" },
  { titleKey: "helpCenter.figures.moneyLeft.title", bodyKey: "helpCenter.figures.moneyLeft.body" },
  { titleKey: "helpCenter.figures.comparison.title", bodyKey: "helpCenter.figures.comparison.body" },
  { titleKey: "helpCenter.figures.budget.title", bodyKey: "helpCenter.figures.budget.body" },
] as const;

type HelpCenterProps = {
  navigation?: boolean;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function HelpCenter({ navigation = true }: HelpCenterProps) {
  const { t } = useTranslation();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [figuresOpen, setFiguresOpen] = useState(false);
  const figuresRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    const handleOpenHelp = (event: Event) => {
      const customEvent = event as CustomEvent<{ section?: HelpCenterSection }>;
      setOpen(true);
      if (customEvent.detail?.section === "financial-figures") {
        setFiguresOpen(true);
        window.setTimeout(() => figuresRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    };
    window.addEventListener(OPEN_HELP_CENTER_EVENT, handleOpenHelp);
    return () => window.removeEventListener(OPEN_HELP_CENTER_EVENT, handleOpenHelp);
  }, []);

  const installApp = () => {
    if (installPrompt == null) return;
    void (async () => {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") setIsInstalled(true);
      } catch {
        toast.error(t("keyUnlock.install.failed"));
      } finally {
        setInstallPrompt(null);
      }
    })();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2" aria-label={t("helpCenter.open")}>
          <HelpCircle className="h-4 w-4" />
          <span className="hidden lg:inline">{t("helpCenter.shortLabel")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[92vw] max-w-md flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-ocean-primary" />
            {t("helpCenter.title")}
          </SheetTitle>
          <SheetDescription>{t("helpCenter.description")}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-3">
          {journeySteps.map((step, index) => {
            const content = (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-sm font-semibold text-ocean-dark tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t(step.titleKey)}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(step.bodyKey)}</p>
                  </div>
                </div>
            );
            return navigation ? (
              <SheetClose key={step.titleKey} asChild>
                <Link
                  to={step.to}
                  search={step.to === "/capture" ? { tab: step.tab } : undefined}
                  className="interactive-surface block rounded-lg border border-border bg-card p-3"
                >
                  {content}
                </Link>
              </SheetClose>
            ) : (
              <article key={step.titleKey} className="rounded-lg border border-border bg-card p-3">
                {content}
              </article>
            );
          })}
        </div>

        <details
          ref={figuresRef}
          open={figuresOpen}
          onToggle={(event) => setFiguresOpen(event.currentTarget.open)}
          className="group mt-5 scroll-mt-5 rounded-lg border border-ocean-primary/25 bg-card"
        >
          <summary className="interactive-surface flex cursor-pointer list-none items-start gap-3 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
              <Wallet className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t("helpCenter.figures.title")}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t("helpCenter.figures.description")}</span>
            </span>
            <HelpCircle className="mt-1 h-4 w-4 shrink-0 text-ocean-primary" />
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {financialTerms.map((term) => (
              <div key={term.titleKey} className="p-3">
                <p className="text-sm font-semibold">{t(term.titleKey)}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(term.bodyKey)}</p>
              </div>
            ))}
          </div>
        </details>

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
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isInstalled ? t("keyUnlock.install.installed") : t("helpCenter.installNote")}
              </p>
              {!isInstalled && installPrompt != null && (
                <Button type="button" size="sm" className="mt-3 gap-2" onClick={installApp}>
                  <Download className="h-4 w-4" />
                  {t("keyUnlock.install.button")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
