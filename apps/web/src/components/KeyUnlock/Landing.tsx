import { lazy, Suspense, useRef } from "react";
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button.tsx";
import Logo from "../Logo.tsx";
import HelpActions from "../HelpActions.tsx";

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
  const primaryLabel = hasVault ? t("keyUnlock.landing.openVault") : t("keyUnlock.landing.start");
  const assurances = [
    { icon: <ShieldCheck className="h-4 w-4" />, label: t("keyUnlock.landing.assurances.encrypted") },
    { icon: <WifiOff className="h-4 w-4" />, label: t("keyUnlock.landing.assurances.offline") },
    { icon: <KeyRound className="h-4 w-4" />, label: t("keyUnlock.landing.assurances.yours") },
  ];

  return (
    <main aria-label={t("keyUnlock.landing.aria")} className="landing-grid min-h-dvh overflow-x-clip bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3 py-3">
          <Logo className="h-8 w-auto" />
          <div className="flex shrink-0 items-center gap-2">
            <HelpActions compact />
            <Suspense fallback={<span aria-hidden="true" className="block h-9 w-[76px]" />}><LanguageSwitcher compact /></Suspense>
            <Button type="button" onClick={onStart} disabled={busy} className="ml-2 hidden h-9 px-4 sm:inline-flex">
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

          <LandingGlimpse />
        </div>
      </section>
    </main>
  );
}

/**
 * A static preview of the Home summary card. Amounts are masked on purpose: the page shows
 * the shape of the product, never invented figures. Decorative, so hidden from assistive tech.
 */
const GLIMPSE_MAX_TILT_DEG = 7;

function LandingGlimpse() {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const masked = "\u2022\u2022\u2022\u2022\u2022\u2022";
  // The tilt follows the pointer through two CSS custom properties; the transform, its
  // transition and the reduced-motion / touch opt-outs live in index.css (.landing-glimpse).
  // Setting the variables from JS is the only way to feed pointer coordinates to that rule.
  const tilt = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (card == null || event.pointerType !== "mouse") return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty("--tilt-x", `${(-y * GLIMPSE_MAX_TILT_DEG).toFixed(2)}deg`);
    card.style.setProperty("--tilt-y", `${(x * GLIMPSE_MAX_TILT_DEG).toFixed(2)}deg`);
  };
  const rest = () => {
    cardRef.current?.style.removeProperty("--tilt-x");
    cardRef.current?.style.removeProperty("--tilt-y");
  };
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm lg:max-w-md" onPointerMove={tilt} onPointerLeave={rest}>
      <div className="absolute -inset-6 rounded-[2rem] bg-ocean-wash/70 blur-2xl" />
      <div ref={cardRef} className="landing-glimpse relative rounded-2xl border border-border bg-card p-5 shadow-[0_24px_60px_rgba(16,24,32,0.14)] sm:p-6">
        <p className="text-xs font-medium text-ocean-primary">{t("dashboard.availableToday")}</p>
        <p className="mt-2 text-3xl font-semibold tracking-[0.22em] text-foreground/55">{masked}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("keyUnlock.landing.glimpse.caption")}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">{t("dashboard.moneyReceived")}</p>
            <p className="mt-1 text-base font-semibold tracking-[0.2em] text-positive/70">{masked}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">{t("dashboard.moneySpent")}</p>
            <p className="mt-1 text-base font-semibold tracking-[0.2em] text-negative/70">{masked}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-ocean-wash/60 px-3 py-2 text-xs font-medium text-ocean-dark">
          <span>{t("keyUnlock.landing.glimpse.footer")}</span>
          <LockKeyhole className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
