import { ArrowLeft, Bot, ChevronDown, ChevronRight, Download, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Logo from "../components/Logo.tsx";
import LanguageSwitcher from "../components/LanguageSwitcher.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { getHelpSections, searchHelpSections } from "./corpus.ts";
import { closeHelp } from "./navigation.ts";
import { usePwaInstall } from "../pwa/install.tsx";
import { openUpdates } from "../releases/navigation.ts";
import { useWiseBot } from "./WiseBotProvider.tsx";
import { recordCoachNotificationClick } from "../coach/index.ts";

export default function HelpPage() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const { openWiseBot } = useWiseBot();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const install = usePwaInstall();
  const sections = useMemo(() => getHelpSections(i18n.resolvedLanguage ?? i18n.language), [i18n.language, i18n.resolvedLanguage]);
  const results = useMemo(() => searchHelpSections(sections, query), [query, sections]);

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id.length === 0) return;
    if (new URLSearchParams(window.location.search).get("coachTip") === id) {
      recordCoachNotificationClick(id);
      window.history.replaceState(window.history.state, "", `/help#${encodeURIComponent(id)}`);
    }
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const platformInstruction = t(`helpPage.install.${install.platform}`);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button type="button" variant="ghost" size="sm" className="justify-self-start gap-2" onClick={closeHelp} aria-label={t("helpPage.back")}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t("helpPage.back")}</span>
          </Button>
          <Logo className="h-8 w-auto justify-self-center" />
          <LanguageSwitcher compact />
        </div>
      </header>

      {/* One list: a title, a search field, and each topic as a row that opens its steps. The
          page used to open on a hero, a counter and a decoration, and close on two notices. */}
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="page-title">{t("helpPage.eyebrow")}</h1>

        <div className="relative">
          <label htmlFor="help-search" className="sr-only">{t("helpPage.searchLabel")}</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            id="help-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("helpPage.searchPlaceholder")}
            className="h-12 pl-10 text-base"
          />
        </div>

        <Button type="button" variant="outline" className="w-full justify-between sm:hidden" onClick={() => openWiseBot({ entryPoint: "manual", surfaceId: "help" })}>
          <span className="flex items-center gap-2"><Bot className="h-4 w-4" />{t("helpPage.chat.askWiseBot")}</span>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <section aria-label={t("helpPage.results")}>
          {query.length > 0 && (
            <p className="mb-2 text-sm text-muted-foreground">{t("helpPage.resultCount", { count: results.length })}</p>
          )}
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
              <p className="font-semibold">{t("helpPage.noResult")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("helpPage.noResultHint")}</p>
            </div>
          ) : (
            <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {results.map((section) => (
                <li id={section.id} key={`${section.id}-${query}`} className="scroll-mt-20">
                  <details className="group" open={query.length > 0 || window.location.hash === `#${section.id}`}>
                    <summary className="interactive-surface flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{section.title}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-border bg-background/50 px-4 py-3">
                      <ol className="space-y-2 text-sm leading-relaxed">
                        {section.steps.map((step, index) => (
                          <li key={step} className="grid grid-cols-[1.5rem_1fr] gap-2">
                            <span className="font-semibold tabular-nums text-ocean-primary">{index + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      {section.id === "installation" && (
                        <div className="mt-3 border-l-2 border-ocean-primary pl-3">
                          <p className="text-sm font-semibold">{t("helpPage.install.yourDevice")}</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{platformInstruction}</p>
                          {!install.installed && install.canPrompt && (
                            <Button type="button" className="mt-3 gap-2" onClick={() => void install.promptInstall()}>
                              <Download className="h-4 w-4" /> {t("helpPage.install.prompt")}
                            </Button>
                          )}
                          {install.installed && <p className="mt-2 text-sm font-semibold text-ocean-primary">{t("helpPage.install.installed")}</p>}
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>

        <Button type="button" variant="ghost" className="gap-2 text-ocean-primary" onClick={() => openUpdates()}>
          <Sparkles className="h-4 w-4" /> {t("helpPage.updates.action")}
        </Button>
      </main>

    </div>
  );
}
