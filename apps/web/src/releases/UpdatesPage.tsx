import { ArrowLeft, ArrowUpRight, BookOpen } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher.tsx";
import Logo from "../components/Logo.tsx";
import { Button } from "../components/ui/button.tsx";
import { openHelp } from "../help/navigation.ts";
import { closeUpdates, releaseAnchor } from "./navigation.ts";
import {
  CURRENT_RELEASE,
  getReleaseContent,
  PRODUCT_RELEASES,
  resolveReleaseLocale,
} from "./releaseNotes.ts";

function formatReleaseDate(date: string, language: string): string {
  return new Intl.DateTimeFormat(resolveReleaseLocale(language), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export default function UpdatesPage({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const currentContent = getReleaseContent(CURRENT_RELEASE, language);

  useEffect(() => {
    if (!visible) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    window.requestAnimationFrame(() => {
      if (id.length > 0) document.getElementById(id)?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
    });
  }, [visible]);

  return (
    <div className="min-h-dvh bg-white text-[#101820]">
      <header className="sticky top-0 z-50 border-b border-black/15 bg-white/95 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button type="button" variant="ghost" size="sm" className="justify-self-start gap-2" onClick={closeUpdates} aria-label={t("updatesPage.back")}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t("updatesPage.back")}</span>
          </Button>
          <Logo className="h-8 w-auto justify-self-center" />
          <LanguageSwitcher compact />
        </div>
      </header>

      <main>
        <section id={releaseAnchor(CURRENT_RELEASE.version)} className="scroll-mt-16 border-b border-black/15">
          <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
            <div className="px-4 py-12 sm:px-6 sm:py-16 lg:border-r lg:border-black/15 lg:px-8 lg:py-24">
              <p className="text-sm font-bold text-[#002fa7]">{t("updatesPage.eyebrow")}</p>
              <h1 className="mt-5 max-w-5xl text-[clamp(3.2rem,7.5vw,8rem)] font-bold leading-[0.88] tracking-[-0.055em]">
                {t("updatesPage.title")}
              </h1>
              <p className="mt-8 max-w-3xl text-xl font-semibold leading-tight sm:text-3xl">
                {currentContent.title}
              </p>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-black/65 sm:text-lg">
                {currentContent.summary}
              </p>
            </div>

            <aside className="grid min-h-72 grid-rows-[1fr_auto] bg-[#002fa7] text-white">
              <div className="flex items-start justify-between gap-4 p-5 sm:p-8">
                <span className="text-sm font-bold">{t("updatesPage.current")}</span>
                <span className="border border-white/40 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]">
                  {t("updatesPage.official")}
                </span>
              </div>
              <div className="border-t border-white/25 p-5 sm:p-8">
                <p className="text-[clamp(4rem,10vw,8rem)] font-bold leading-none tracking-[-0.065em] tabular-nums">
                  {CURRENT_RELEASE.version}
                </p>
                <p className="mt-4 text-sm text-white/75">
                  {formatReleaseDate(CURRENT_RELEASE.releasedAt, language)}
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section aria-labelledby="release-highlights" className="border-b border-black/15 bg-[#f7f7f8]">
          <div className="mx-auto max-w-[1440px]">
            <div className="border-b border-black/15 px-4 py-6 sm:px-8">
              <h2 id="release-highlights" className="text-2xl font-bold sm:text-3xl">{t("updatesPage.highlights")}</h2>
            </div>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-3">
              {currentContent.highlights.map((highlight, index) => (
                <li
                  key={highlight.id}
                  className="min-h-64 border-b border-black/15 bg-white p-5 sm:p-8 sm:[&:nth-child(odd)]:border-r lg:border-r lg:[&:nth-child(3n)]:border-r-0"
                >
                  <span className="text-5xl font-bold leading-none tracking-[-0.05em] text-[#002fa7] tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-10 text-xl font-bold leading-tight sm:text-2xl">{highlight.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-black/65 sm:text-base">{highlight.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="release-history" className="border-b border-black/15">
          <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(250px,0.45fr)_minmax(0,1.55fr)]">
            <div className="border-b border-black/15 px-4 py-8 sm:px-8 lg:border-b-0 lg:border-r">
              <h2 id="release-history" className="text-2xl font-bold">{t("updatesPage.history")}</h2>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-black/60">{t("updatesPage.historyDescription")}</p>
            </div>
            <ol>
              {PRODUCT_RELEASES.map((release) => {
                const content = getReleaseContent(release, language);
                return (
                  <li
                    id={release.version === CURRENT_RELEASE.version ? undefined : releaseAnchor(release.version)}
                    key={release.version}
                    className="scroll-mt-16 grid gap-4 border-b border-black/15 px-4 py-7 last:border-b-0 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:px-8"
                  >
                    <a href={`#${releaseAnchor(release.version)}`} className="text-3xl font-bold tracking-[-0.04em] text-[#002fa7] tabular-nums">
                      {release.version}
                    </a>
                    <div>
                      <p className="font-bold">{content.title}</p>
                      <p className="mt-1 text-sm text-black/55">{formatReleaseDate(release.releasedAt, language)}</p>
                    </div>
                    <a className="inline-flex items-center gap-2 text-sm font-bold text-[#002fa7] hover:underline" href={release.githubUrl} target="_blank" rel="noreferrer">
                      {t("updatesPage.technicalDetails")} <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </main>

      <footer className="bg-[#002fa7] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="text-xl font-bold">{t("updatesPage.needHelp")}</p>
            <p className="mt-1 text-sm text-white/70">{t("updatesPage.needHelpDescription")}</p>
          </div>
          <Button type="button" variant="secondary" className="min-h-11 rounded-none border border-white bg-white text-[#002fa7]" onClick={() => openHelp()}>
            <BookOpen className="h-4 w-4" /> {t("updatesPage.openHelp")}
          </Button>
        </div>
      </footer>
    </div>
  );
}
