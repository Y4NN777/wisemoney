import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  deriveMasterKey,
  createWebAuthnCredential,
  setupMasterKey,
  verifyPassphrase,
  unwrapMasterKeyWithWebAuthn,
} from "../../crypto/keyManagement.ts";
import type { MasterKey } from "../../crypto/envelope.ts";
import { db } from "../../db/schema.ts";
import { lockSession, register, restoreSession } from "../../auth/session.ts";
import { importJSON } from "../../exportImport/index.ts";
import { RouterProvider } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "../../router.ts";
import { MasterKeyContext, VaultActionsContext } from "../../lib/masterKeyContext.ts";
import { seedDefaultCategories } from "../../pillars/state/index.ts";
import { isEdgeConfigured } from "../../lib/capabilities.ts";
import { ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronUp, Download, Eye, EyeOff, ShieldCheck, Upload, WifiOff } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import Logo from "../../components/Logo.tsx";
import HelpCenter from "../../components/HelpCenter.tsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.tsx";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type Flow =
  | "loading"
  | "landing"
  | "restore"
  | "onboarding"
  | "setup"
  | "unlock-passphrase"
  | "unlock-webauthn"
  | "app";

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function KeyUnlock() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [flow, setFlow] = useState<Flow>("loading");
  const [error, setError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState<MasterKey | null>(null);
  const [vaultUnlockFlow, setVaultUnlockFlow] = useState<"setup" | "unlock-passphrase" | "unlock-webauthn">("setup");

  const openVault = async (mk: MasterKey) => {
    await restoreSession(mk);
    const meta = await db.keyMeta.get("primary");
    setVaultUnlockFlow(meta?.webAuthnHandle != null ? "unlock-webauthn" : "unlock-passphrase");
    queryClient.clear();
    setMasterKey(mk);
    setFlow("app");
  };

  const lockVault = () => {
    lockSession();
    queryClient.clear();
    setMasterKey(null);
    setError(null);
    setFlow(vaultUnlockFlow);
  };

  useEffect(() => {
    let active = true;
    void db.keyMeta.get("primary").then((meta) => {
      if (!active) return;
      if (meta == null) {
        setVaultUnlockFlow("setup");
        setFlow(isStandaloneDisplayMode() ? "restore" : "landing");
      } else if (meta.webAuthnHandle != null) {
        setVaultUnlockFlow("unlock-webauthn");
        setFlow("landing");
      } else {
        setVaultUnlockFlow("unlock-passphrase");
        setFlow("landing");
      }
    }).catch(() => {
      if (active) {
        setError(t("keyUnlock.errors.localStorage"));
        setFlow("landing");
      }
    });
    return () => {
      active = false;
    };
  }, [t]);

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
        onStart={() => setFlow(vaultUnlockFlow === "setup" ? "onboarding" : vaultUnlockFlow)}
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
  } else if (flow === "onboarding") {
    content = <OnboardingFlow onBack={() => setFlow("landing")} onComplete={() => setFlow("setup")} />;
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
        onUnlock={openVault}
        error={error}
        setError={setError}
      />
    );
  } else {
    content = <AppShell masterKey={masterKey!} onLock={lockVault} />;
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

function LandingOnboarding({ onStart, hasVault }: LandingOnboardingProps) {
  const { t } = useTranslation();
  const primaryLabel = hasVault ? t("keyUnlock.landing.openVault") : t("keyUnlock.landing.start");
  const trustItems = [
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: t("keyUnlock.landing.steps.vault.title"),
      body: t("keyUnlock.landing.steps.vault.body"),
    },
    {
      icon: <WifiOff className="h-5 w-5" />,
      title: t("keyUnlock.landing.steps.offline.title"),
      body: t("keyUnlock.landing.steps.offline.body"),
    },
    {
      icon: <Bot className="h-5 w-5" />,
      title: t("keyUnlock.landing.steps.ai.title"),
      body: t("keyUnlock.landing.steps.ai.body"),
    },
  ];

  return (
    <main aria-label={t("keyUnlock.landing.aria")} className="landing-grid min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-border py-3">
          <Logo className="h-8 w-auto" />
          <div className="flex items-center gap-2">
            <HelpCenter navigation={false} />
            <LanguageSwitcher compact />
            <Button type="button" onClick={onStart} className="hidden h-9 px-4 sm:inline-flex">
              {hasVault ? t("keyUnlock.landing.openApp") : t("keyUnlock.landing.start")}
            </Button>
          </div>
        </header>

        <div className="grid flex-1 border-b border-border lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="flex flex-col justify-center gap-7 py-10 lg:border-r lg:border-border lg:py-16 lg:pr-12">
            <div className="space-y-5">
              <p className="text-sm font-semibold text-ocean-primary">{t("keyUnlock.landing.kicker")}</p>
              <h1 className="max-w-4xl text-4xl font-bold leading-[0.98] tracking-normal text-foreground sm:text-6xl lg:text-7xl">
                {t("keyUnlock.landing.title")}
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("keyUnlock.landing.body")}
              </p>
              {hasVault && (
                <p className="max-w-2xl border-l-2 border-ocean-primary pl-4 text-sm leading-relaxed text-muted-foreground">
                  {t("keyUnlock.landing.existingVault")}
                </p>
              )}
            </div>
            <Button type="button" onClick={onStart} className="h-12 w-full justify-between px-4 sm:max-w-xs">
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <aside className="flex flex-col justify-center py-8 lg:pl-10">
            <div className="border border-border bg-card">
              {trustItems.map((item, index) => (
                <article
                  key={item.title}
                  className={`grid grid-cols-[3.5rem_1fr] ${index < trustItems.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="flex flex-col items-center gap-3 border-r border-border p-3 text-ocean-primary">
                    <span className="text-lg font-bold tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                    {item.icon}
                  </div>
                  <div className="p-4 sm:p-5">
                    <h2 className="text-base font-semibold text-foreground">{item.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
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
  const [enableDeviceUnlock, setEnableDeviceUnlock] = useState(false);
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
        const mk = await setupWithOptionalDeviceUnlock(passphrase, enableDeviceUnlock, t);
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
        <div className="grid gap-0 border border-border bg-card/95 shadow-sm lg:grid-cols-[0.92fr_1.08fr]">
          <aside className="border-b border-border bg-ocean-primary p-5 text-white lg:border-b-0 lg:border-r">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">{t("keyUnlock.restore.kicker")}</p>
            <h1 className="mt-3 text-4xl font-bold leading-none sm:text-5xl">{t("keyUnlock.restore.title")}</h1>
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
                <DeviceUnlockOption checked={enableDeviceUnlock} onCheckedChange={setEnableDeviceUnlock} />
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

function OnboardingFlow({ onBack, onComplete }: { onBack: () => void; onComplete: () => void }) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const steps = [
    {
      title: t("keyUnlock.onboarding.steps.vault.title"),
      body: t("keyUnlock.onboarding.steps.vault.body"),
      icon: <ShieldCheck className="h-6 w-6" />,
    },
    {
      title: t("keyUnlock.onboarding.steps.offline.title"),
      body: t("keyUnlock.onboarding.steps.offline.body"),
      icon: <WifiOff className="h-6 w-6" />,
    },
    {
      title: t("keyUnlock.onboarding.steps.services.title"),
      body: t("keyUnlock.onboarding.steps.services.body"),
      icon: <Bot className="h-6 w-6" />,
    },
    {
      title: t("keyUnlock.onboarding.steps.install.title"),
      body: t("keyUnlock.onboarding.steps.install.body"),
      icon: <Download className="h-6 w-6" />,
    },
  ];
  const currentStep = steps[stepIndex]!;
  const isLastStep = stepIndex === steps.length - 1;

  const handleBack = () => {
    if (stepIndex === 0) {
      onBack();
      return;
    }
    setStepIndex((index) => index - 1);
  };

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setStepIndex((index) => index + 1);
  };

  return (
    <main aria-label={t("keyUnlock.onboarding.aria")} className="landing-grid flex min-h-dvh flex-col bg-background p-4 text-foreground">
      <AuthTopBar onBack={onBack} />
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-6">
        <div className="border border-border bg-card/95 shadow-sm">
          <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
            <aside className="border-b border-border bg-ocean-primary p-5 text-white lg:border-b-0 lg:border-r">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">{t("keyUnlock.onboarding.kicker")}</p>
              <h1 className="mt-3 text-4xl font-bold leading-none sm:text-5xl">{t("keyUnlock.onboarding.title")}</h1>
              <div className="mt-8 grid grid-cols-4 gap-2 lg:grid-cols-1">
                {steps.map((step, index) => (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => setStepIndex(index)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      index === stepIndex
                        ? "border-white bg-white text-ocean-primary"
                        : "border-white/25 bg-white/10 text-white hover:bg-white/20"
                    }`}
                    aria-current={index === stepIndex ? "step" : undefined}
                  >
                    <span className="block text-xs font-bold tabular-nums">0{index + 1}</span>
                    <span className="mt-2 hidden text-sm font-semibold lg:block">{step.title}</span>
                  </button>
                ))}
              </div>
            </aside>
            <div className="flex min-h-[28rem] flex-col justify-between p-5 sm:p-8">
              <article className="landing-step">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-md border border-border bg-ocean-wash text-ocean-primary">
                  {currentStep.icon}
                </div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ocean-primary">{t("keyUnlock.onboarding.stepLabel", { number: `0${stepIndex + 1}` })}</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight text-foreground sm:text-5xl">{currentStep.title}</h2>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{currentStep.body}</p>
              </article>
              <div className="mt-10 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <Button type="button" variant="outline" onClick={handleBack} className="justify-between gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  {t("common.back")}
                </Button>
                <div className="flex justify-center gap-2">
                  {steps.map((step, index) => (
                    <span
                      key={step.title}
                      className={`h-2 rounded-full transition-all ${index === stepIndex ? "w-8 bg-ocean-primary" : "w-2 bg-border"}`}
                    />
                  ))}
                </div>
                <Button type="button" onClick={handleNext} className="justify-between gap-2">
                  {isLastStep ? t("keyUnlock.setup.createVault") : t("common.next")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
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
        <LanguageSwitcher />
        <Button type="button" variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("keyUnlock.backToOverview")}
        </Button>
      </div>
    </header>
  );
}

type AppShellProps = {
  masterKey: MasterKey;
  onLock: () => void;
};

function AppShell({ masterKey, onLock }: AppShellProps) {
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
        <RouterProvider router={router} />
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
  const [enableDeviceUnlock, setEnableDeviceUnlock] = useState(false);

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
        const mk = await setupWithOptionalDeviceUnlock(passphrase, enableDeviceUnlock, t);
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
          <CardDescription>
            {t("keyUnlock.setup.description")}
          </CardDescription>
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
            <DeviceUnlockOption checked={enableDeviceUnlock} onCheckedChange={setEnableDeviceUnlock} />
            <Button type="submit" disabled={submitting || passphrase.length === 0} className="w-full">
              {submitting ? t("keyUnlock.setup.submitting") : t("keyUnlock.setup.createVault")}
            </Button>
          </form>
          <CloudEdgeAuth />
        </CardContent>
      </Card>
      </div>
    </main>
  );
}

type Translate = (key: string) => string;

async function setupWithOptionalDeviceUnlock(
  passphrase: string,
  enabled: boolean,
  t: Translate,
): Promise<MasterKey> {
  if (!enabled) return setupMasterKey(passphrase);

  let credentialId: Uint8Array;
  try {
    credentialId = await createWebAuthnCredential();
  } catch {
    toast.warning(t("keyUnlock.setup.deviceUnlockUnavailable"));
    return setupMasterKey(passphrase);
  }

  try {
    return await setupMasterKey(passphrase, undefined, credentialId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("WebAuthn wrap failed")) {
      toast.warning(t("keyUnlock.setup.deviceUnlockUnavailable"));
      return setupMasterKey(passphrase);
    }
    throw error;
  }
}

function DeviceUnlockOption({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-accent/35 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span>
        <span className="block text-sm font-medium">{t("keyUnlock.setup.deviceUnlock")}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{t("keyUnlock.setup.deviceUnlockDescription")}</span>
      </span>
    </label>
  );
}

function CloudEdgeAuth() {
  const { t } = useTranslation();
  const edgeConfigured = isEdgeConfigured();
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordsVisible, setPasswordsVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="mt-4 text-center text-xs text-green-600 dark:text-green-400">
        {t("keyUnlock.cloud.linked")}
      </p>
    );
  }

  if (!edgeConfigured) {
    return (
      <div className="mt-6 rounded-lg border border-border bg-accent/45 p-3">
        <p className="text-sm font-medium">{t("keyUnlock.cloud.notConnected")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("keyUnlock.cloud.localOnly")}
        </p>
      </div>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (email.length === 0 || password.length === 0) {
      setError(t("keyUnlock.cloud.errors.required"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("keyUnlock.login.errors.passwordsMismatch"));
      return;
    }
    setSubmitting(true);
    void (async () => {
      try {
        await register(email, password);
        setDone(true);
      } catch {
        setError(t("keyUnlock.cloud.errors.failed"));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <div className="mt-6 rounded-lg border border-border bg-accent/45 p-2">
      <Button
        type="button"
        variant="ghost"
        className="flex w-full items-center justify-between text-sm text-muted-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{t("keyUnlock.cloud.title")}</span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {expanded && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-4 px-1 pb-1">
          {error != null && (
            <p role="alert" className="text-destructive text-sm">{error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="edge-email">{t("keyUnlock.login.email")}</Label>
            <Input
              id="edge-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edge-password">{t("keyUnlock.login.password")}</Label>
            <div className="relative">
              <Input
                id="edge-password"
                type={passwordsVisible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                onClick={() => setPasswordsVisible(!passwordsVisible)}
                aria-label={passwordsVisible ? t("byoKey.hideKey") : t("byoKey.showKey")}
                tabIndex={-1}
              >
                {passwordsVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edge-confirm-password">{t("keyUnlock.login.confirmPassword")}</Label>
            <Input
              id="edge-confirm-password"
              type={passwordsVisible ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full" variant="secondary">
            {submitting ? t("keyUnlock.cloud.connecting") : t("keyUnlock.cloud.createAccount")}
          </Button>
        </form>
      )}
    </div>
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
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <Logo className="w-48 h-auto" />
      <Card className="metric-surface w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("keyUnlock.unlock.title")}</CardTitle>
          <CardDescription>{t("keyUnlock.unlock.descriptionPassphrase")}</CardDescription>
        </CardHeader>
        <CardContent>
          {error != null && (
            <p role="alert" className="text-destructive text-sm mb-4">{error}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
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
        </CardContent>
      </Card>
      </div>
    </main>
  );
}

type WebAuthnUnlockProps = {
  onBack: () => void;
  onUnlock: (masterKey: MasterKey) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
};

function WebAuthnUnlock({ onBack, onUnlock, error, setError }: WebAuthnUnlockProps) {
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
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <Logo className="w-48 h-auto" />
      <Card className="metric-surface w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("keyUnlock.unlock.title")}</CardTitle>
          <CardDescription>{t("keyUnlock.unlock.webauthnDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {error != null && (
            <p role="alert" className="text-destructive text-sm mb-4">{error}</p>
          )}
          <Button
            type="button"
            onClick={handleUnlock}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? t("keyUnlock.unlock.webauthnAuthenticating") : t("keyUnlock.unlock.webauthnButton")}
          </Button>
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
