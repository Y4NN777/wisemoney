import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowRight, GraduationCap, LockKeyhole, PenLine, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button.tsx";
import Logo from "../Logo.tsx";
import HelpActions from "../HelpActions.tsx";
import { useHideWiseBotLauncher } from "../../help/WiseBotProvider.tsx";
import { readQuickEntry } from "../../capture/quickEntry.ts";

// The dropdown library behind the language switcher is as large as the rest of this page, so it
// arrives after the first paint; the placeholder keeps the header from shifting.
const LanguageSwitcher = lazy(() => import("../LanguageSwitcher.tsx"));

type LandingOnboardingProps = {
  onStart: () => void;
  /** Opens the restore screen; offered only while this device holds no space. */
  onRestore: () => void;
  hasVault: boolean;
  /** Start was tapped while the vault flows were still loading. */
  busy?: boolean;
};


/**
 * The public landing page, kept apart from the vault flows so that a first visit paints it
 * without downloading the storage, key-derivation and application code (UX audit 2026-10).
 */
export default function LandingOnboarding({ onStart, onRestore, hasVault, busy = false }: LandingOnboardingProps) {
  const { t } = useTranslation();
  // The header's help button already leads to help and WiseHelp; the floating one covered the demo.
  useHideWiseBotLauncher();
  const primaryLabel = hasVault ? t("keyUnlock.landing.openVault") : t("keyUnlock.landing.start");
  const assurances = [
    { icon: <PenLine className="h-4 w-4" />, label: t("keyUnlock.landing.assurances.oneLine") },
    { icon: <ShieldCheck className="h-4 w-4" />, label: t("keyUnlock.landing.assurances.offline") },
    { icon: <GraduationCap className="h-4 w-4" />, label: t("keyUnlock.landing.assurances.education") },
  ];

  return (
    <main aria-label={t("keyUnlock.landing.aria")} className="landing-grid min-h-dvh overflow-x-clip bg-background text-foreground">
      {/* Bottom room so the floating WiseHelp button never sits on the demo card. */}
      <section className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-24 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3 py-3">
          <Logo variant="icon" className="h-9 w-9" />
          <div className="flex shrink-0 items-center gap-2">
            <HelpActions compact />
            <Suspense fallback={<span aria-hidden="true" className="block h-11 w-[72px]" />}><LanguageSwitcher compact /></Suspense>
            <Button type="button" onClick={onStart} disabled={busy} className="ml-2 hidden h-11 px-4 sm:inline-flex">
              {hasVault ? t("keyUnlock.landing.openApp") : t("keyUnlock.landing.start")}
            </Button>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:gap-16 lg:py-16">
          <div className="flex flex-col gap-8">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocean-primary">{t("keyUnlock.landing.kicker")}</p>
              <h1 className="max-w-3xl text-4xl font-bold leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-[4.25rem]">
                {t("keyUnlock.landing.title")}
              </h1>
              <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("keyUnlock.landing.body")}
              </p>
              {hasVault && (
                <p className="max-w-lg border-l-2 border-ocean-primary pl-4 text-sm font-medium text-foreground">
                  {t("keyUnlock.landing.existingVault")}
                </p>
              )}
            </div>
            <Button type="button" onClick={onStart} disabled={busy} aria-busy={busy} className="h-12 w-full justify-between px-5 text-base sm:max-w-xs">
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
            {!hasVault && (
              <button type="button" onClick={onRestore} disabled={busy} className="-mt-4 inline-flex min-h-11 items-center self-start text-sm font-medium text-ocean-primary underline underline-offset-4">
                {t("keyUnlock.landing.restore")}
              </button>
            )}
            <ul aria-label={t("keyUnlock.landing.assurancesAria")} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {assurances.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span className="text-ocean-primary">{item.icon}</span>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <LandingDemo />
        </div>
      </section>
    </main>
  );
}

/** Typing pace and how long each understood phrase stays before the next one. */
const DEMO_TYPE_MS = 70;
const DEMO_HOLD_MS = 2_600;
const DEMO_CURRENCY = "XOF";

/**
 * A live demo of the quick line: a local phrase types itself and the card shows what the real reader
 * understood. The first phrase fits the hour (the same examples as the capture sheet). No amount is a
 * user figure: these are example notes. Still under reduced motion. Decorative for assistive tech:
 * the benefits list says the same in words.
 */
function LandingDemo() {
  const { t, i18n } = useTranslation();
  const phrases = useMemo(() => {
    const byHour = [t("capture.quick.starters.morning"), t("capture.quick.starters.midday"), t("capture.quick.starters.evening")];
    const hour = new Date().getHours();
    const first = hour < 11 ? 0 : hour < 16 ? 1 : 2;
    return [byHour[first]!, ...byHour.filter((_, index) => index !== first), t("keyUnlock.landing.demo.income")];
  }, [t]);
  const still = useMemo(() => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(still ? phrases[0]! : "");
  const phrase = phrases[index] ?? "";

  useEffect(() => {
    if (still) return;
    const timerId = typed.length < phrase.length
      ? window.setTimeout(() => setTyped(phrase.slice(0, typed.length + 1)), DEMO_TYPE_MS)
      : window.setTimeout(() => { setIndex((current) => (current + 1) % phrases.length); setTyped(""); }, DEMO_HOLD_MS);
    return () => window.clearTimeout(timerId);
  }, [phrase, phrases.length, still, typed]);

  const item = typed === phrase ? readQuickEntry(typed, { currency: DEMO_CURRENCY })[0] : undefined;
  const amount = item?.amount == null
    ? null
    : new Intl.NumberFormat(i18n.language, { style: "currency", currency: DEMO_CURRENCY, maximumFractionDigits: 0 }).format(Number(item.amount));
  const direction = item?.direction ?? "expense";

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm lg:max-w-md">
      <div className="absolute -inset-6 rounded-[2rem] bg-ocean-wash/70 blur-2xl" />
      <div className="relative rounded-2xl border border-border bg-card p-5 shadow-[0_24px_60px_rgba(16,24,32,0.14)] sm:p-6">
        <p className="text-xs font-medium text-ocean-primary">{t("capture.quick.label")}</p>
        <p className="mt-2 flex h-12 items-center rounded-lg border border-input bg-background px-3 text-base text-foreground">
          {typed}
          {!still && <span className="landing-caret ml-0.5 inline-block h-5 w-0.5 bg-ocean-primary" />}
        </p>
        <div className="mt-4 min-h-[5.5rem]">
          <p className="text-xs text-muted-foreground">{t("keyUnlock.landing.demo.understood")}</p>
          <p className={`mt-1 text-3xl font-semibold tracking-tight transition-opacity ${amount == null ? "opacity-0" : "opacity-100"} ${direction === "income" ? "text-positive" : "text-foreground"}`}>
            {amount ?? "0"}
          </p>
          <p className={`mt-2 flex flex-wrap gap-2 text-xs transition-opacity ${amount == null ? "opacity-0" : "opacity-100"}`}>
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{t(`capture.transaction.${direction}`)}</span>
            {item != null && item.note.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{item.note}</span>}
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-ocean-wash/60 px-3 py-2 text-xs font-medium text-ocean-dark">
          <span>{t("keyUnlock.landing.glimpse.footer")}</span>
          <LockKeyhole className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
