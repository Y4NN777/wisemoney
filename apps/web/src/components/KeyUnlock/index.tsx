import { useState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import {
  deriveMasterKey,
  setupMasterKey,
  verifyPassphrase,
  unwrapMasterKeyWithWebAuthn,
} from "../../crypto/keyManagement.ts";
import type { MasterKey } from "../../crypto/envelope.ts";
import { db } from "../../db/schema.ts";
import { register, restoreSession } from "../../auth/session.ts";
import { importJSON } from "../../exportImport/index.ts";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "../../router.ts";
import { MasterKeyContext } from "../../lib/masterKeyContext.ts";
import { seedDefaultCategories } from "../../pillars/state/index.ts";
import { isEdgeConfigured } from "../../lib/capabilities.ts";
import { ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronUp, Download, Eye, EyeOff, Languages, LayoutDashboard, PiggyBank, ReceiptText, Settings, ShieldCheck, Smartphone, Upload, WalletCards, WifiOff } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import Logo from "../../components/Logo.tsx";
import { useTranslation } from "react-i18next";

type Flow =
  | "loading"
  | "landing"
  | "restore"
  | "onboarding"
  | "setup"
  | "unlock-passphrase"
  | "unlock-webauthn"
  | "app";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function KeyUnlock() {
  const { t } = useTranslation();
  const [flow, setFlow] = useState<Flow>("loading");
  const [error, setError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState<MasterKey | null>(null);
  const [vaultUnlockFlow, setVaultUnlockFlow] = useState<"setup" | "unlock-passphrase" | "unlock-webauthn">("setup");

  useEffect(() => {
    void db.keyMeta.get("primary").then((meta) => {
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
    });
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
        onStart={() => setFlow(vaultUnlockFlow === "setup" ? "onboarding" : vaultUnlockFlow)}
        hasVault={vaultUnlockFlow !== "setup"}
      />
    );
  } else if (flow === "restore") {
    content = (
      <RestoreWorkspace
        onBack={() => setFlow("landing")}
        onCreateNew={() => setFlow("setup")}
        onReady={async (mk) => {
          setMasterKey(mk);
          await restoreSession(mk);
          setFlow("app");
        }}
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
        onReady={async (mk) => {
          setMasterKey(mk);
          await restoreSession(mk);
          setFlow("app");
        }}
        error={error}
        setError={setError}
      />
    );
  } else if (flow === "unlock-passphrase") {
    content = (
      <PassphraseUnlock
        onBack={() => setFlow("landing")}
        onUnlock={async (mk) => {
          setMasterKey(mk);
          await restoreSession(mk);
          setFlow("app");
        }}
        error={error}
        setError={setError}
      />
    );
  } else if (flow === "unlock-webauthn") {
    content = (
      <WebAuthnUnlock
        onBack={() => setFlow("landing")}
        onUnlock={async (mk) => {
          setMasterKey(mk);
          await restoreSession(mk);
          setFlow("app");
        }}
        error={error}
        setError={setError}
      />
    );
  } else {
    content = <AppShell masterKey={masterKey!} />;
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
  const primaryLabel = hasVault ? t("keyUnlock.landing.openVault") : t("keyUnlock.landing.startOnboarding");

  return (
    <main aria-label={t("keyUnlock.landing.aria")} className="landing-grid min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-border py-3">
          <Logo className="h-8 w-auto" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button type="button" onClick={onStart} className="h-9 px-4">
              {hasVault ? t("keyUnlock.landing.openApp") : t("keyUnlock.landing.start")}
            </Button>
          </div>
        </header>

        <div className="grid flex-1 gap-0 border-b border-border lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <div className="grid content-start gap-8 border-border py-8 lg:border-r lg:py-12 lg:pr-10">
            <div className="space-y-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ocean-primary">{t("keyUnlock.landing.kicker")}</p>
              <h1 className="max-w-4xl text-5xl font-bold leading-[0.94] tracking-normal text-foreground sm:text-7xl lg:text-8xl">
                {t("keyUnlock.landing.title")}
              </h1>
              <p className="max-w-2xl text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
                {t("keyUnlock.landing.body")}
              </p>
              {hasVault && (
                <p className="max-w-2xl border-l-4 border-ocean-primary pl-4 text-base font-medium leading-relaxed text-muted-foreground">
                  {t("keyUnlock.landing.existingVault")}
                </p>
              )}
            </div>

            <ProductPreviewPanel />

            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
              <Button type="button" onClick={onStart} className="h-12 justify-between px-4">
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <a
                href="#help"
                className="flex h-12 items-center justify-between rounded-md border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-accent"
              >
                {t("keyUnlock.landing.viewSteps")}
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <aside className="grid content-start gap-4 py-6 lg:py-12 lg:pl-8">
            <InstallPromptCard />
            <div className="border border-border bg-card">
              <div className="border-b border-border bg-ocean-primary p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">{t("keyUnlock.landing.afterSetup")}</p>
                <h2 className="mt-2 text-2xl font-bold leading-tight">{t("keyUnlock.landing.workspaceTitle")}</h2>
              </div>
              <div className="grid grid-cols-2">
                <ProductTile icon={<LayoutDashboard className="h-5 w-5" />} label={t("nav.dashboard")} />
                <ProductTile icon={<ReceiptText className="h-5 w-5" />} label={t("nav.capture")} />
                <ProductTile icon={<WalletCards className="h-5 w-5" />} label={t("dashboard.accounts")} />
                <ProductTile icon={<PiggyBank className="h-5 w-5" />} label={t("nav.planning")} />
                <ProductTile icon={<Bot className="h-5 w-5" />} label={t("nav.assistant")} />
                <ProductTile icon={<Settings className="h-5 w-5" />} label={t("nav.settings")} />
              </div>
            </div>
            <div className="border border-border bg-card">
              <OnboardingRow
                number="01"
                icon={<ShieldCheck className="h-5 w-5" />}
                title={t("keyUnlock.landing.steps.vault.title")}
                body={t("keyUnlock.landing.steps.vault.body")}
              />
              <OnboardingRow
                number="02"
                icon={<WifiOff className="h-5 w-5" />}
                title={t("keyUnlock.landing.steps.offline.title")}
                body={t("keyUnlock.landing.steps.offline.body")}
              />
              <OnboardingRow
                number="03"
                icon={<Bot className="h-5 w-5" />}
                title={t("keyUnlock.landing.steps.ai.title")}
                body={t("keyUnlock.landing.steps.ai.body")}
              />
              <OnboardingRow
                number="04"
                icon={<Download className="h-5 w-5" />}
                title={t("keyUnlock.landing.steps.install.title")}
                body={t("keyUnlock.landing.steps.install.body")}
                isLast
              />
            </div>
          </aside>
        </div>
        <LandingHelpAndFaq />
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
        const mk = await setupMasterKey(passphrase);
        await importJSON(file, mk, exportPassphrase.trim().length > 0 ? exportPassphrase.trim() : undefined);
        await onReady(mk);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("keyUnlock.restore.errors.failed"));
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

function LandingHelpAndFaq() {
  const { t } = useTranslation();
  const guideItems = [
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: t("keyUnlock.help.guide.private.title"),
      body: t("keyUnlock.help.guide.private.body"),
    },
    {
      icon: <Smartphone className="h-5 w-5" />,
      title: t("keyUnlock.help.guide.install.title"),
      body: t("keyUnlock.help.guide.install.body"),
    },
    {
      icon: <WifiOff className="h-5 w-5" />,
      title: t("keyUnlock.help.guide.offline.title"),
      body: t("keyUnlock.help.guide.offline.body"),
    },
    {
      icon: <Bot className="h-5 w-5" />,
      title: t("keyUnlock.help.guide.assistant.title"),
      body: t("keyUnlock.help.guide.assistant.body"),
    },
  ];
  const faqItems = [
    {
      question: t("keyUnlock.help.faq.data.question"),
      answer: t("keyUnlock.help.faq.data.answer"),
    },
    {
      question: t("keyUnlock.help.faq.internet.question"),
      answer: t("keyUnlock.help.faq.internet.answer"),
    },
    {
      question: t("keyUnlock.help.faq.install.question"),
      answer: t("keyUnlock.help.faq.install.answer"),
    },
    {
      question: t("keyUnlock.help.faq.ai.question"),
      answer: t("keyUnlock.help.faq.ai.answer"),
    },
    {
      question: t("keyUnlock.help.faq.sync.question"),
      answer: t("keyUnlock.help.faq.sync.answer"),
    },
  ];

  return (
    <section id="help" aria-label={t("keyUnlock.help.aria")} className="border-b border-border py-10 lg:py-14">
      <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ocean-primary">{t("keyUnlock.help.kicker")}</p>
          <h2 className="max-w-xl text-3xl font-bold leading-tight text-foreground sm:text-5xl">{t("keyUnlock.help.title")}</h2>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">{t("keyUnlock.help.body")}</p>
        </div>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {guideItems.map((item) => (
              <article key={item.title} className="landing-step border border-border bg-card p-4">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
                  {item.icon}
                </div>
                <h3 className="text-lg font-bold leading-tight text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
          <div className="border border-border bg-card">
            <div className="border-b border-border bg-ocean-primary p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">{t("keyUnlock.help.faqKicker")}</p>
              <h3 className="mt-2 text-2xl font-bold leading-tight">{t("keyUnlock.help.faqTitle")}</h3>
            </div>
            <div className="divide-y divide-border">
              {faqItems.map((item) => (
                <details key={item.question} className="group p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-bold text-foreground">
                    {item.question}
                    <ChevronDown className="h-4 w-4 shrink-0 text-ocean-primary transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPreviewPanel() {
  const { t } = useTranslation();
  return (
    <section aria-label={t("keyUnlock.preview.aria")} className="landing-preview-panel border border-border bg-card/90 shadow-sm lg:max-w-3xl">
      <div className="flex items-center justify-between border-b border-border bg-ocean-wash/80 p-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-primary">{t("keyUnlock.preview.kicker")}</p>
          <h2 className="mt-1 text-lg font-bold leading-tight text-foreground">{t("keyUnlock.preview.title")}</h2>
        </div>
        <span className="hidden rounded-md border border-ocean-primary/25 bg-card px-2 py-1 text-xs font-semibold text-ocean-primary sm:inline-flex">
          {t("keyUnlock.preview.offlineReady")}
        </span>
      </div>
      <div className="grid min-h-[20rem] gap-0 md:grid-cols-[1.05fr_0.95fr] lg:min-h-[24rem]">
        <div className="grid content-between gap-5 border-b border-border p-4 md:border-b-0 md:border-r">
          <div className="preview-flow-line mb-4 h-1 rounded-full bg-ocean-primary" />
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1">
            <PreviewRow label={t("keyUnlock.preview.rows.cashFlow")} tone="primary" width="w-10/12" value={t("keyUnlock.preview.rowStates.live")} />
            <PreviewRow label={t("keyUnlock.preview.rows.budgetChecks")} tone="secondary" width="w-8/12" value={t("keyUnlock.preview.rowStates.review")} />
            <PreviewRow label={t("keyUnlock.preview.rows.savingsGoals")} tone="sage" width="w-9/12" value={t("keyUnlock.preview.rowStates.track")} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PreviewStatus label={t("keyUnlock.preview.status.vault")} value={t("keyUnlock.preview.status.local")} />
            <PreviewStatus label={t("keyUnlock.preview.status.network")} value={t("keyUnlock.preview.status.offline")} />
            <PreviewStatus label={t("keyUnlock.preview.status.services")} value={t("keyUnlock.preview.status.optional")} />
          </div>
        </div>
        <div className="grid grid-rows-[1fr_auto]">
          <div className="grid grid-cols-2">
            <PreviewMetric label={t("dashboard.accounts")} value={t("keyUnlock.preview.metrics.accounts")} />
            <PreviewMetric label={t("nav.capture")} value={t("keyUnlock.preview.metrics.capture")} />
            <PreviewMetric label={t("nav.planning")} value={t("keyUnlock.preview.metrics.planning")} />
            <PreviewMetric label={t("nav.settings")} value={t("keyUnlock.preview.metrics.settings")} />
          </div>
          <div className="border-t border-border bg-background/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-primary">{t("keyUnlock.preview.deviceLabel")}</p>
            <div className="mt-3 grid grid-cols-[2.4rem_1fr] gap-3">
              <div className="landing-device-pulse flex h-10 w-10 items-center justify-center rounded-md bg-ocean-primary text-white">
                <Smartphone className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium leading-relaxed text-muted-foreground">{t("keyUnlock.preview.deviceBody")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewRow({ label, tone, width, value }: { label: string; tone: "primary" | "secondary" | "sage"; width: string; value: string }) {
  const toneClass = {
    primary: "bg-ocean-primary",
    secondary: "bg-ocean-secondary",
    sage: "bg-sage",
  }[tone];

  return (
    <div className="preview-row rounded-md border border-border bg-background/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs font-semibold text-ocean-primary">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className={`h-2 rounded-full ${toneClass} ${width}`} />
      </div>
    </div>
  );
}

function PreviewStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="preview-row rounded-md border border-border bg-card p-2">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-28 border-b border-r border-border p-3 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-primary">{label}</p>
      <p className="mt-4 text-sm font-bold leading-tight text-foreground">{value}</p>
    </div>
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

function InstallPromptCard() {
  const { t } = useTranslation();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = () => {
    if (installPrompt == null) return;
    void (async () => {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
    })();
  };

  return (
    <div className="border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border bg-accent/65 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-ocean-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold leading-tight text-foreground">{t("keyUnlock.install.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("keyUnlock.install.body")}
          </p>
        </div>
      </div>
      <div className="grid gap-3 p-4">
        {isInstalled ? (
          <p className="rounded-md border border-ocean-primary bg-ocean-primary px-3 py-2 text-sm font-semibold text-white">
            {t("keyUnlock.install.installed")}
          </p>
        ) : installPrompt != null ? (
          <Button type="button" onClick={handleInstall} className="h-11 justify-between px-4">
            {t("keyUnlock.install.button")}
            <Download className="h-4 w-4" />
          </Button>
        ) : (
          <div className="rounded-md border border-border bg-accent/60 p-3 text-sm leading-relaxed text-muted-foreground">
            <p className="font-bold text-foreground">{t("keyUnlock.install.manualTitle")}</p>
            <p className="mt-1">{t("keyUnlock.install.android")}</p>
            <p className="mt-1">{t("keyUnlock.install.ios")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductTile({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-24 flex-col justify-between border-b border-r border-border p-3 last:border-r-0 even:border-r-0">
      <span className="text-ocean-primary">{icon}</span>
      <span className="text-sm font-bold text-foreground">{label}</span>
    </div>
  );
}

function OnboardingRow({
  number,
  icon,
  title,
  body,
  isLast = false,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  body: string;
  isLast?: boolean;
}) {
  return (
    <article className={`landing-step grid grid-cols-[4rem_1fr] gap-0 ${isLast ? "" : "border-b border-border"}`}>
      <div className="border-r border-border p-3 text-2xl font-bold tabular-nums text-ocean-primary">{number}</div>
      <div className="p-4">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-ocean-primary">
          {icon}
        </div>
        <h2 className="text-lg font-bold leading-tight text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </article>
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

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const resolvedLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const language = resolvedLanguage.startsWith("fr") ? "fr" : "en";

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1" aria-label={t("settings.devices.language")}>
      <Languages className="mx-1 h-4 w-4 text-ocean-primary" aria-hidden="true" />
      {(["en", "fr"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => {
            void i18n.changeLanguage(code);
          }}
          className={`rounded px-2 py-1 text-xs font-bold uppercase transition-colors ${
            language === code ? "bg-ocean-primary text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          aria-pressed={language === code}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

type AppShellProps = {
  masterKey: MasterKey;
};

function AppShell({ masterKey }: AppShellProps) {
  useEffect(() => {
    void seedDefaultCategories(masterKey);
  }, [masterKey]);

  return (
    <MasterKeyContext.Provider value={masterKey}>
      <RouterProvider router={router} />
    </MasterKeyContext.Provider>
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
      } catch (err) {
        setError(err instanceof Error ? err.message : t("keyUnlock.setup.errors.failed"));
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
      } catch (err) {
        setError(err instanceof Error ? err.message : t("keyUnlock.cloud.errors.failed"));
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
      } catch (err) {
        setError(err instanceof Error ? err.message : t("keyUnlock.unlock.errors.unlockFailed"));
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
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("keyUnlock.unlock.webauthnErrors.failed"),
        );
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
