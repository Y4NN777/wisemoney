import { ArrowLeft, ArrowUpRight, BookOpen, Check } from "lucide-react";
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

export default function UpdatesPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const currentContent = getReleaseContent(CURRENT_RELEASE, language);
  const olderReleases = PRODUCT_RELEASES.slice(1);

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    window.requestAnimationFrame(() => {
      if (id.length > 0) document.getElementById(id)?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
    });
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Button type="button" variant="ghost" size="sm" className="justify-self-start gap-2" onClick={closeUpdates} aria-label={t("updatesPage.back")}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t("updatesPage.back")}</span>
          </Button>
          <Logo className="h-8 w-auto justify-self-center" />
          <LanguageSwitcher compact />
        </div>
      </header>

      {/* One short screen: the version, its date, and what it lets you do as a list of titles.
          The page used to carry a hero, a summary and a paragraph per item; nobody read it. */}
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        <section id={releaseAnchor(CURRENT_RELEASE.version)} className="scroll-mt-20">
          <h1 className="page-title">{t("updatesPage.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("updatesPage.version")} <span className="font-semibold text-foreground tabular-nums">{CURRENT_RELEASE.version}</span>
            {" · "}{formatReleaseDate(CURRENT_RELEASE.releasedAt, language)}
          </p>
          <p className="mt-4 text-lg font-semibold leading-snug">{currentContent.title}</p>
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {currentContent.highlights.map((highlight) => (
              <li key={highlight.id} className="flex items-center gap-3 px-4 py-3 text-sm font-medium">
                <Check className="h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
                {highlight.title}
              </li>
            ))}
          </ul>
        </section>

        {olderReleases.length > 0 && (
          <section aria-labelledby="release-history">
            <h2 id="release-history" className="text-sm font-semibold text-muted-foreground">{t("updatesPage.history")}</h2>
            <ol className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {olderReleases.map((release) => (
                <li id={releaseAnchor(release.version)} key={release.version} className="scroll-mt-20 px-4 py-3">
                  <p className="text-sm font-semibold">
                    <span className="tabular-nums">{release.version}</span>
                    <span className="font-normal text-muted-foreground">{" · "}{formatReleaseDate(release.releasedAt, language)}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{getReleaseContent(release, language).title}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="gap-2" onClick={() => openHelp()}>
            <BookOpen className="h-4 w-4" /> {t("updatesPage.openHelp")}
          </Button>
          <Button asChild variant="ghost" className="gap-2 text-ocean-primary">
            <a href={CURRENT_RELEASE.githubUrl} target="_blank" rel="noreferrer">
              {t("updatesPage.technicalDetails")} <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
}
