import { ArrowLeft, Bot, Download, Search, ShieldCheck, Sparkles, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import HelpChat from "./HelpChat.tsx";
import Logo from "../components/Logo.tsx";
import LanguageSwitcher from "../components/LanguageSwitcher.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { getHelpSections, searchHelpSections } from "./corpus.ts";
import { closeHelp } from "./navigation.ts";
import { usePwaInstall } from "../pwa/install.tsx";
import { openUpdates } from "../releases/navigation.ts";

export default function HelpPage({ visible, vaultUnlocked }: { visible: boolean; vaultUnlocked: boolean }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [wiseBotOpenRequest, setWiseBotOpenRequest] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const install = usePwaInstall();
  const sections = useMemo(() => getHelpSections(i18n.resolvedLanguage ?? i18n.language), [i18n.language, i18n.resolvedLanguage]);
  const results = useMemo(() => searchHelpSections(sections, query), [query, sections]);

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id.length === 0) return;
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible]);

  const platformInstruction = t(`helpPage.install.${install.platform}`);

  return (
    <div className="help-page min-h-dvh bg-white text-[#101820]">
      <header className="sticky top-0 z-50 border-b border-black/15 bg-white/95 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button type="button" variant="ghost" size="sm" className="justify-self-start gap-2" onClick={closeHelp} aria-label={t("helpPage.back")}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t("helpPage.back")}</span>
          </Button>
          <Logo className="h-8 w-auto justify-self-center" />
          <LanguageSwitcher compact />
        </div>
      </header>

      <main>
        <section className="border-b border-black/15">
          <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <div className="px-4 py-12 sm:px-6 sm:py-16 lg:border-r lg:border-black/15 lg:px-8 lg:py-24">
              <p className="mb-5 text-sm font-bold text-[#002fa7]">{t("helpPage.eyebrow")}</p>
              <h1 className="max-w-5xl text-[clamp(3.25rem,8vw,8.5rem)] font-bold leading-[0.86] tracking-[-0.055em]">
                {t("helpPage.title")}
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-relaxed text-black/65 sm:text-xl">
                {t("helpPage.intro")}
              </p>
            </div>
            <div className="grid min-h-64 grid-cols-2 border-t border-black/15 lg:border-t-0">
              <div className="flex flex-col justify-between border-r border-black/15 bg-[#002fa7] p-5 text-white sm:p-7">
                <span className="text-7xl font-bold tabular-nums sm:text-8xl">12</span>
                <span className="max-w-32 text-sm leading-tight">{t("helpPage.paths")}</span>
              </div>
              <div className="help-orbit relative overflow-hidden bg-[#f7f7f8] p-5 sm:p-7" aria-hidden="true">
                <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#002fa7]" />
                <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#002fa7] bg-white" />
                <div className="absolute left-[calc(50%-0.5rem)] top-[calc(50%-0.5rem)] h-4 w-4 bg-[#002fa7]" />
                <div className="absolute left-[18%] top-[22%] h-3 w-3 bg-[#002fa7]" />
                <div className="absolute bottom-[20%] right-[16%] h-3 w-3 border border-[#002fa7] bg-white" />
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-black/15 bg-[#002fa7] text-white sm:hidden">
          <div className="px-4 py-5">
            <Bot className="h-6 w-6" />
            <h2 className="mt-4 text-xl font-bold">{t("helpPage.chat.mobileTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{t("helpPage.chat.mobileDescription")}</p>
            <Button
              type="button"
              variant="secondary"
              className="mt-4 min-h-12 w-full justify-between rounded-none border border-white bg-white text-[#002fa7]"
              onClick={() => setWiseBotOpenRequest((request) => request + 1)}
            >
              {t("helpPage.chat.askWiseBot")}
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </Button>
          </div>
        </section>

        <section className="border-b border-black/15 bg-[#f7f7f8]">
          <div className="mx-auto grid max-w-[1440px] gap-0 lg:grid-cols-[minmax(250px,0.45fr)_minmax(0,1.55fr)]">
            <label htmlFor="help-search" className="flex items-center border-b border-black/15 px-4 py-4 text-sm font-bold lg:border-b-0 lg:border-r lg:px-8">
              {t("helpPage.searchLabel")}
            </label>
            <div className="relative bg-white p-2 sm:p-3">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#002fa7] sm:left-6" />
              <Input
                ref={searchRef}
                id="help-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("helpPage.searchPlaceholder")}
                className="h-12 border-black/20 bg-white pl-10 pr-14 text-base shadow-none hover:border-[#002fa7]/50 focus-visible:border-[#002fa7] focus-visible:ring-[#002fa7]"
              />
              <kbd className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 border border-black/20 bg-[#f7f7f8] px-2 py-1 text-[11px] text-black/55 sm:block">⌘ K</kbd>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(250px,0.45fr)_minmax(0,1.55fr)]">
          <nav aria-label={t("helpPage.contents")} className="hidden border-r border-black/15 p-8 lg:block">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.12em] text-black/50">{t("helpPage.contents")}</p>
            <ol className="space-y-1">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="grid grid-cols-[2.25rem_1fr] py-2 text-sm leading-tight text-black/65 hover:text-[#002fa7]">
                    <span className="font-bold tabular-nums text-[#002fa7]">{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <section aria-label={t("helpPage.results")} className="min-w-0">
            {query.length > 0 && (
              <div className="border-b border-black/15 bg-[#edf1ff] px-4 py-3 text-sm sm:px-8">
                {t("helpPage.resultCount", { count: results.length })}
              </div>
            )}
            {results.length === 0 ? (
              <div className="px-4 py-20 text-center sm:px-8">
                <p className="text-xl font-bold">{t("helpPage.noResult")}</p>
                <p className="mt-2 text-sm text-black/60">{t("helpPage.noResultHint")}</p>
              </div>
            ) : (
              <ol className="divide-y divide-black/15">
                {results.map((section) => {
                  const originalIndex = sections.findIndex(({ id }) => id === section.id);
                  return (
                    <li id={section.id} key={`${section.id}-${query}`} className="scroll-mt-20">
                      <details className="group" open={query.length > 0 || window.location.hash === `#${section.id}`}>
                        <summary className="grid cursor-pointer list-none grid-cols-[4.25rem_1fr_2.5rem] gap-3 px-4 py-7 transition-colors hover:bg-[#f7f7f8] sm:grid-cols-[6.5rem_1fr_3rem] sm:px-8 sm:py-9">
                          <span className="text-4xl font-bold leading-none tracking-[-0.05em] text-[#002fa7] sm:text-6xl">
                            {String(originalIndex + 1).padStart(2, "0")}
                          </span>
                          <span>
                            <span className="block text-xl font-bold leading-tight sm:text-3xl">{section.title}</span>
                            <span className="mt-2 block max-w-3xl text-sm leading-relaxed text-black/60 sm:text-base">{section.summary}</span>
                          </span>
                          <span className="flex h-8 w-8 items-center justify-center border border-black/20 text-xl leading-none text-[#002fa7] group-open:bg-[#002fa7] group-open:text-white">
                            <span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span>
                          </span>
                        </summary>
                        <div className="grid border-t border-black/10 bg-[#f7f7f8] sm:grid-cols-[6.5rem_1fr]">
                          <div className="hidden border-r border-black/10 sm:block" />
                          <ol className="divide-y divide-black/10">
                            {section.steps.map((step, index) => (
                              <li key={step} className="grid grid-cols-[2rem_1fr] gap-3 px-4 py-4 text-sm leading-relaxed sm:px-8 sm:text-base">
                                <span className="font-bold tabular-nums text-[#002fa7]">{index + 1}.</span>
                                <span>{step}</span>
                              </li>
                            ))}
                            {section.id === "installation" && (
                              <li className="px-4 py-5 sm:px-8">
                                <div className="border-l-2 border-[#002fa7] bg-white p-4">
                                  <p className="text-sm font-bold">{t("helpPage.install.yourDevice")}</p>
                                  <p className="mt-1 text-sm leading-relaxed text-black/65">{platformInstruction}</p>
                                  {!install.installed && install.canPrompt && (
                                    <Button type="button" className="mt-4 gap-2" onClick={() => void install.promptInstall()}>
                                      <Download className="h-4 w-4" /> {t("helpPage.install.prompt")}
                                    </Button>
                                  )}
                                  {install.installed && <p className="mt-3 text-sm font-semibold text-[#002fa7]">{t("helpPage.install.installed")}</p>}
                                </div>
                              </li>
                            )}
                          </ol>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <section className="border-y border-black/15 bg-[#002fa7] text-white">
          <div className="mx-auto grid max-w-[1440px] md:grid-cols-2">
            <div className="border-b border-white/25 p-6 md:border-b-0 md:border-r md:p-10">
              <ShieldCheck className="h-6 w-6" />
              <h2 className="mt-8 text-2xl font-bold">{t("helpPage.footer.privateTitle")}</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">{t("helpPage.footer.privateBody")}</p>
            </div>
            <div className="p-6 md:p-10">
              <WifiOff className="h-6 w-6" />
              <h2 className="mt-8 text-2xl font-bold">{t("helpPage.footer.offlineTitle")}</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">{t("helpPage.footer.offlineBody")}</p>
            </div>
          </div>
        </section>

        <section className="border-b border-black/15 bg-white">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <h2 className="text-lg font-bold">{t("helpPage.updates.title")}</h2>
              <p className="mt-1 text-sm text-black/60">{t("helpPage.updates.description")}</p>
            </div>
            <Button type="button" variant="outline" className="min-h-11 rounded-none" onClick={() => openUpdates()}>
              <Sparkles className="h-4 w-4" /> {t("helpPage.updates.action")}
            </Button>
          </div>
        </section>
      </main>

      <HelpChat sections={sections} openRequest={wiseBotOpenRequest} vaultUnlocked={vaultUnlocked} />
    </div>
  );
}
