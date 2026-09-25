import { useState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import {
  deriveMasterKey,
  setupMasterKey,
  verifyPassphrase,
  unwrapMasterKeyWithWebAuthn,
} from "../../crypto/keyManagement.ts";
import type { MasterKey } from "../../crypto/envelope.ts";
import { db } from "../../db/schema.ts";
import { lockSession, restoreSession } from "../../auth/session.ts";
import { importJSON } from "../../exportImport/index.ts";
import { useQueryClient } from "@tanstack/react-query";
import { MasterKeyContext, VaultActionsContext } from "../../lib/masterKeyContext.ts";
import { clearCachedMasterKey, getCachedMasterKey, setCachedMasterKey } from "../../lib/vaultUnlocked.ts";
import { recordPassphraseUnlock } from "../../lib/deviceUnlockOffer.ts";
import { seedDefaultCategories } from "../../pillars/state/index.ts";
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, LockOpen, PlusCircle, ShieldCheck, Smartphone, Upload, WifiOff } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import Logo from "../../components/Logo.tsx";
import HelpActions from "../../components/HelpActions.tsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.tsx";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type Flow =
  | "loading"
  | "landing"
  | "restore"
  | "intro"
  | "setup"
  | "unlock-passphrase"
  | "unlock-webauthn"
  | "app";

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type KeyUnlockProps = {
  onVaultUnlockedChange: (unlocked: boolean) => void;
  /** The unlocked application shell; rendered once the vault is open. */
  children: ReactNode;
};

export default function KeyUnlock({ onVaultUnlockedChange, children }: KeyUnlockProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const translationRef = useRef(t);
  translationRef.current = t;
  const [flow, setFlow] = useState<Flow>("loading");
  const [error, setError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState<MasterKey | null>(null);
  const [vaultUnlockFlow, setVaultUnlockFlow] = useState<"setup" | "unlock-passphrase" | "unlock-webauthn">("setup");

  useEffect(() => {
    onVaultUnlockedChange(flow === "app");
  }, [flow, onVaultUnlockedChange]);

  const openVault = async (mk: MasterKey) => {
    await restoreSession(mk);
    const meta = await db.keyMeta.get("primary");
    setVaultUnlockFlow(meta?.webAuthnHandle != null ? "unlock-webauthn" : "unlock-passphrase");
    queryClient.clear();
    setMasterKey(mk);
    setCachedMasterKey(mk);
    setFlow("app");
  };

  const lockVault = () => {
    lockSession();
    clearCachedMasterKey();
    queryClient.clear();
    setMasterKey(null);
    setError(null);
    setFlow(vaultUnlockFlow);
    // Device unlock can be enabled or disabled from Settings while the vault is
    // open, so the unlock method is re-read from keyMeta rather than remembered.
    void db.keyMeta.get("primary").then((meta) => {
      const nextFlow = meta?.webAuthnHandle != null ? "unlock-webauthn" : "unlock-passphrase";
      setVaultUnlockFlow(nextFlow);
      setFlow((current) => (current === "app" ? current : nextFlow));
    }).catch(() => undefined);
  };

  useEffect(() => {
    let active = true;
    void db.keyMeta.get("primary").then((meta) => {
      if (!active) return;
      if (meta == null) {
        setVaultUnlockFlow("setup");
        setFlow(isStandaloneDisplayMode() ? "restore" : "landing");
        return;
      }
      setVaultUnlockFlow(meta.webAuthnHandle != null ? "unlock-webauthn" : "unlock-passphrase");
      // Resume an unlock from before a visit to a public page (the gate
      // unmounts there); the cached key is memory-only (see vaultUnlocked.ts).
      const cachedKey = getCachedMasterKey();
      if (cachedKey != null) {
        void openVault(cachedKey);
        return;
      }
      setFlow("landing");
    }).catch(() => {
      if (active) {
        setError(translationRef.current("keyUnlock.errors.localStorage"));
        setFlow("landing");
      }
    });
    return () => {
      active = false;
    };
    // Vault discovery is a mount-only operation. Translation changes must not
    // rerun it, because doing so resets the user's active unlock step.
  }, []);

  let content: React.ReactNode;

  if (flow === "loading") {
    content = (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4" aria-live="polite">
        <Logo className="w-56 h-auto" />
        <p className="text-sm text-muted-foreground animate-pulse">{t("keyUnlock.loading")}</p>
      </div>
    );
  } else if (flow === "landing") {
    content = (
      <LandingOnboarding
        onStart={() => setFlow(vaultUnlockFlow === "setup" ? "intro" : vaultUnlockFlow)}
        hasVault={vaultUnlockFlow !== "setup"}
      />
    );
  } else if (flow === "restore") {
    content = (
      <RestoreWorkspace
        onBack={() => setFlow("landing")}
        onCreateNew={() => setFlow("setup")}
        onReady={openVault}
        error={error}
        setError={setError}
      />
    );
  } else if (flow === "intro") {
    content = <IntroFlow onBack={() => setFlow("landing")} onComplete={() => setFlow("setup")} />;
  } else if (flow === "setup") {
    content = (
      <LocalSetup
        onBack={() => setFlow("landing")}
        onReady={openVault}
        error={error}
        setError={setError}
      />
    );
  } else if (flow === "unlock-passphrase") {
    content = (
      <PassphraseUnlock
        onBack={() => setFlow("landing")}
        onUnlock={openVault}
        error={error}
        setError={setError}
      />
    );
  } else if (flow === "unlock-webauthn") {
    content = (
      <WebAuthnUnlock
        onBack={() => setFlow("landing")}
        onUsePassphrase={() => setFlow("unlock-passphrase")}
        onUnlock={openVault}
        error={error}
        setError={setError}
      />
    );
  } else {
    content = <AppShell masterKey={masterKey!} onLock={lockVault}>{children}</AppShell>;
  }

  return (
    <>
      {content}
    </>
  );
}

type LandingOnboardingProps = {
  onStart: () => void;
  hasVault: boolean;
};

const INTRO_STEPS = ["device", "passphrase", "firstMove"] as const;

/**
 * Three quiet screens between Start and the passphrase (onboarding-rethink, Y4NN 2026-09-25:
 * the slides back, "but softer"): one icon, one title, one sentence each, always skippable.
 */
function IntroFlow({ onBack, onComplete }: { onBack: () => void; onComplete: () => void }) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const step = INTRO_STEPS[stepIndex]!;
  const isLast = stepIndex === INTRO_STEPS.length - 1;
  const icons = { device: <Smartphone className="h-7 w-7" />, passphrase: <KeyRound className="h-7 w-7" />, firstMove: <PlusCircle className="h-7 w-7" /> };
  return (
    <main aria-label={t("keyUnlock.intro.aria")} className="landing-grid flex min-h-dvh flex-col bg-background p-4 text-foreground">
      <AuthTopBar onBack={stepIndex === 0 ? onBack : () => setStepIndex((index) => index - 1)} />
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-8">
        <div key={step} className="motion-enter flex flex-col items-start gap-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ocean-wash text-ocean-primary">{icons[step]}</span>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocean-primary">
            {t("keyUnlock.intro.stepLabel", { number: stepIndex + 1, total: INTRO_STEPS.length })}
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{t(`keyUnlock.intro.steps.${step}.title`)}</h1>
          <p className="text-base leading-relaxed text-muted-foreground">{t(`keyUnlock.intro.steps.${step}.body`)}</p>
        </div>
        <div className="flex items-center justify-center gap-2" aria-hidden="true">
          {INTRO_STEPS.map((candidate, index) => (
            <span key={candidate} className={`h-2 rounded-full transition-all ${index === stepIndex ? "w-8 bg-ocean-primary" : "w-2 bg-border"}`} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <Button type="button" variant="ghost" onClick={onComplete} className="justify-center">
            {t("keyUnlock.intro.skip")}
          </Button>
          <Button type="button" onClick={isLast ? onComplete : () => setStepIndex((index) => index + 1)} className="h-12 justify-between px-5">
            {isLast ? t("keyUnlock.setup.createVault") : t("common.next")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </main>
  );
}

function LandingOnboarding({ onStart, hasVault }: LandingOnboardingProps) {
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
            <LanguageSwitcher compact />
            <Button type="button" onClick={onStart} className="ml-2 hidden h-9 px-4 sm:inline-flex">
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
            <Button type="button" onClick={onStart} className="h-12 w-full justify-between px-5 text-base sm:max-w-xs">
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
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
            <p className="text-[11px] text-muted-foreground">{t("dashboard.moneyReceived")}</p>
            <p className="mt-1 text-base font-semibold tracking-[0.2em] text-positive/70">{masked}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">{t("dashboard.moneySpent")}</p>
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

type RestoreWorkspaceProps = {
  onBack: () => void;
  onCreateNew: () => void;
  onReady: (masterKey: MasterKey) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
};

function RestoreWorkspace({ onBack, onCreateNew, onReady, error, setError }: RestoreWorkspaceProps) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];
    if (file == null) {
      setError(t("keyUnlock.restore.errors.fileRequired"));
      return;
    }
    if (passphrase.length === 0) {
      setError(t("keyUnlock.restore.errors.passphraseRequired"));
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError(t("keyUnlock.login.errors.passwordsMismatch"));
      return;
    }

    setSubmitting(true);
    void (async () => {
      try {
        const previousKeyMeta = await db.keyMeta.get("primary");
        const mk = await setupMasterKey(passphrase);
        try {
          await importJSON(file, mk, exportPassphrase.trim().length > 0 ? exportPassphrase.trim() : undefined);
        } catch (importError) {
          if (previousKeyMeta == null) {
            await db.keyMeta.delete("primary");
          } else {
            await db.keyMeta.put(previousKeyMeta);
          }
          throw importError;
        }
        await onReady(mk);
      } catch {
        setError(t("keyUnlock.restore.errors.failed"));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <main aria-label={t("keyUnlock.restore.aria")} className="flex min-h-dvh flex-col bg-background p-4">
      <AuthTopBar onBack={onBack} />
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center py-6">
        <div className="grid gap-0 overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm lg:grid-cols-[0.92fr_1.08fr]">
          <aside className="border-b border-border bg-ocean-primary p-5 text-white lg:border-b-0 lg:border-r">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">{t("keyUnlock.restore.kicker")}</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">{t("keyUnlock.restore.title")}</h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">{t("keyUnlock.restore.body")}</p>
            <div className="mt-8 grid gap-3">
              {[
                t("keyUnlock.restore.steps.export"),
                t("keyUnlock.restore.steps.file"),
                t("keyUnlock.restore.steps.passphrase"),
                t("keyUnlock.restore.steps.open"),
              ].map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-md border border-white/15 bg-white/10 p-3">
                  <span className="text-sm font-bold tabular-nums text-white/85">{`0${index + 1}`}</span>
                  <p className="text-sm leading-relaxed text-white/85">{step}</p>
                </div>
              ))}
            </div>
          </aside>
          <div className="p-5 sm:p-8">
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-accent/40 p-4 text-sm leading-relaxed text-muted-foreground">
                {t("keyUnlock.restore.helper")}
              </div>
              {error != null && (
                <p role="alert" className="text-sm text-destructive">{error}</p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="restore-file">{t("keyUnlock.restore.fileLabel")}</Label>
                  <Input
                    id="restore-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.wmexport"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="restore-passphrase">{t("keyUnlock.restore.passphrase")}</Label>
                  <Input
                    id="restore-passphrase"
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="restore-confirm-passphrase">{t("keyUnlock.restore.confirmPassphrase")}</Label>
                  <Input
                    id="restore-confirm-passphrase"
                    type="password"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="restore-export-passphrase">{t("keyUnlock.restore.exportPassphrase")}</Label>
                  <Input
                    id="restore-export-passphrase"
                    type="password"
                    value={exportPassphrase}
                    onChange={(e) => setExportPassphrase(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">{t("keyUnlock.restore.exportPassphraseHelp")}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button type="submit" disabled={submitting} className="justify-between">
                    {submitting ? t("keyUnlock.restore.restoring") : t("keyUnlock.restore.restore")}
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" onClick={onCreateNew} className="justify-between">
                    {t("keyUnlock.restore.createNew")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthTopBar({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-border py-3">
      <Logo className="h-8 w-auto" />
      <div className="flex items-center gap-2">
        <LanguageSwitcher compact />
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="h-9 w-9 gap-2 px-0 sm:w-auto sm:px-4"
          aria-label={t("keyUnlock.backToOverview")}
          title={t("keyUnlock.backToOverview")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{t("keyUnlock.back")}</span>
        </Button>
      </div>
    </header>
  );
}

type AppShellProps = {
  masterKey: MasterKey;
  onLock: () => void;
  children: ReactNode;
};

function AppShell({ masterKey, onLock, children }: AppShellProps) {
  const { t } = useTranslation();
  const [categoriesReady, setCategoriesReady] = useState(false);

  useEffect(() => {
    let active = true;
    setCategoriesReady(false);
    void seedDefaultCategories(masterKey)
      .catch(() => {
        toast.error(t("keyUnlock.errors.categoryInitialization"));
      })
      .finally(() => {
        if (active) setCategoriesReady(true);
      });
    return () => {
      active = false;
    };
  }, [masterKey]);

  if (!categoriesReady) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4" aria-live="polite">
        <Logo className="h-auto w-56" />
        <p className="text-sm text-muted-foreground animate-pulse">{t("keyUnlock.loading")}</p>
      </div>
    );
  }

  return (
    <VaultActionsContext.Provider value={{ lockVault: onLock }}>
      <MasterKeyContext.Provider value={masterKey}>
        {children}
      </MasterKeyContext.Provider>
    </VaultActionsContext.Provider>
  );
}

type LocalSetupProps = {
  onBack: () => void;
  onReady: (masterKey: MasterKey) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
};

function LocalSetup({ onBack, onReady, error, setError }: LocalSetupProps) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passphrase.length === 0) {
      setError(t("keyUnlock.unlock.errors.passphraseRequired"));
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError(t("keyUnlock.login.errors.passwordsMismatch"));
      return;
    }
    setSubmitting(true);
    void (async () => {
      try {
        const mk = await setupMasterKey(passphrase);
        await onReady(mk);
      } catch {
        setError(t("keyUnlock.setup.errors.failed"));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <main aria-label={t("keyUnlock.setup.aria")} className="flex min-h-dvh flex-col bg-background p-4">
      <AuthTopBar onBack={onBack} />
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <Logo className="w-48 h-auto" />
      <Card className="metric-surface w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("keyUnlock.setup.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {error != null && (
            <p role="alert" className="text-destructive text-sm mb-4">{error}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-passphrase">{t("keyUnlock.login.passphraseTitle")}</Label>
              <Input
                id="setup-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-passphrase">{t("keyUnlock.setup.confirmPassphrase")}</Label>
              <Input
                id="confirm-passphrase"
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("keyUnlock.login.passphraseDescription")}
            </p>
            <Button type="submit" disabled={submitting || passphrase.length === 0} className="w-full">
              {submitting ? t("keyUnlock.setup.submitting") : t("keyUnlock.setup.createVault")}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </main>
  );
}


type PassphraseUnlockProps = {
  onBack: () => void;
  onUnlock: (masterKey: MasterKey) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
};

function PassphraseUnlock({ onBack, onUnlock, error, setError }: PassphraseUnlockProps) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passphrase.length === 0) {
      setError(t("keyUnlock.unlock.errors.passphraseRequired"));
      return;
    }
    setSubmitting(true);
    void (async () => {
      try {
        const valid = await verifyPassphrase(passphrase);
        if (!valid) {
          setError(t("keyUnlock.unlock.errors.incorrectPassphrase"));
          setSubmitting(false);
          return;
        }
        const meta = await db.keyMeta.get("primary");
        if (meta == null) throw new Error("keyMeta not found");
        const { masterKey } = await deriveMasterKey(
          passphrase,
          meta.argon2idParams,
          meta.argon2idSalt,
        );
        recordPassphraseUnlock();
        await onUnlock(masterKey);
      } catch {
        setError(t("keyUnlock.unlock.errors.unlockFailed"));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <main aria-label={t("keyUnlock.unlock.aria")} className="flex min-h-dvh flex-col bg-background p-4">
      <AuthTopBar onBack={onBack} />
      <div className="flex flex-1 items-center justify-center py-8">
        <section className="w-full max-w-sm border-y border-border py-6">
          <h1 className="text-2xl font-semibold tracking-normal">{t("keyUnlock.unlock.title")}</h1>
          {error != null && (
            <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>
          )}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unlock-passphrase">{t("keyUnlock.unlock.passphrase")}</Label>
              <Input
                id="unlock-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                required
                autoFocus
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? t("keyUnlock.unlock.unlocking") : t("keyUnlock.unlock.unlock")}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

type WebAuthnUnlockProps = {
  onBack: () => void;
  onUsePassphrase: () => void;
  onUnlock: (masterKey: MasterKey) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
};

function WebAuthnUnlock({ onBack, onUsePassphrase, onUnlock, error, setError }: WebAuthnUnlockProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const handleUnlock = () => {
    setError(null);
    setSubmitting(true);
    void (async () => {
      try {
        const meta = await db.keyMeta.get("primary");
        if (
          meta == null ||
          meta.webAuthnHandle == null ||
          meta.wrappedKey == null ||
          meta.wrappedIv == null
        ) {
          setError(t("keyUnlock.unlock.webauthnErrors.notConfigured"));
          setSubmitting(false);
          return;
        }
        const mk = await unwrapMasterKeyWithWebAuthn(
          meta.webAuthnHandle,
          meta.wrappedKey,
          meta.wrappedIv,
        );
        await onUnlock(mk);
      } catch {
        setError(t("keyUnlock.unlock.webauthnErrors.failed"));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <main aria-label={t("keyUnlock.unlock.aria")} className="flex min-h-dvh flex-col bg-background p-4">
      <AuthTopBar onBack={onBack} />
      <div className="flex flex-1 items-center justify-center py-8">
        <section className="w-full max-w-sm border-y border-border py-6">
          <h1 className="text-2xl font-semibold tracking-normal">{t("keyUnlock.unlock.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("keyUnlock.unlock.deviceUnlockHint")}</p>
          {error != null && (
            <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>
          )}
          <Button
            type="button"
            onClick={handleUnlock}
            disabled={submitting}
            className="mt-6 w-full"
          >
            <LockOpen className="h-4 w-4" />
            {submitting ? t("keyUnlock.unlock.webauthnAuthenticating") : t("keyUnlock.unlock.unlock")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onUsePassphrase}
            className="mt-2 w-full text-muted-foreground"
          >
            {t("keyUnlock.unlock.usePassphrase")}
          </Button>
        </section>
      </div>
    </main>
  );
}
