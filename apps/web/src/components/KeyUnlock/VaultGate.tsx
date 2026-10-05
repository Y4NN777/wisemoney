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
import { isStandaloneDisplayMode } from "../../lib/displayMode.ts";
import { writeVaultHint } from "../../lib/vaultHint.ts";
import { saveFirstSessionState } from "../../firstSession/firstSession.ts";
import { createAccount, seedDefaultCategories } from "../../pillars/state/index.ts";
import { guessBaseCurrency, setStoredBaseCurrency } from "../../domain/currencyStore.ts";
import { ArrowLeft, ArrowRight, LockOpen, Upload } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import Logo from "../../components/Logo.tsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.tsx";
import LandingOnboarding from "./Landing.tsx";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type Flow =
  | "loading"
  | "landing"
  | "restore"
  | "setup"
  | "unlock-passphrase"
  | "unlock-webauthn"
  | "app";

type VaultGateProps = {
  onVaultUnlockedChange: (unlocked: boolean) => void;
  /** What the gate module shows while this one loads; reused until vault discovery answers. */
  pending: ReactNode;
  /** Start was tapped on the landing page before this module had loaded. */
  startRequested: boolean;
  onStartHandled: () => void;
  /** The unlocked application shell; rendered once the vault is open. */
  children: ReactNode;
};

/** Setup, unlock and restore: everything behind the landing page that needs storage or keys. */
export default function VaultGate({ onVaultUnlockedChange, pending, startRequested, onStartHandled, children }: VaultGateProps) {
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
    writeVaultHint(true);
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
      writeVaultHint(meta != null);
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

  const start = () => setFlow(vaultUnlockFlow);
  // Start may have been tapped while this module was still loading: honour it as soon as
  // discovery has put the landing page in charge, and only then.
  useEffect(() => {
    if (!startRequested || flow !== "landing") return;
    onStartHandled();
    setFlow(vaultUnlockFlow);
  }, [flow, onStartHandled, startRequested, vaultUnlockFlow]);

  let content: React.ReactNode;

  if (flow === "loading") {
    content = pending;
  } else if (flow === "landing") {
    content = (
      <LandingOnboarding
        onStart={start}
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
        // A fresh space starts with one account in the setup language, so Home never reads
        // "0 accounts" and the first movement has somewhere to go (onboarding rethink, 2026-09-25).
        const startingCurrency = guessBaseCurrency(typeof navigator === "undefined" ? [] : navigator.languages);
        await setStoredBaseCurrency(startingCurrency, mk);
        await createAccount({
          name: t("captureSheet.cashName"),
          type: "cash",
          initialBalance: { minorUnits: 0, currency: startingCurrency },
          masterKey: mk,
        });
        // A new space starts its guided first session; spaces without this record (created
        // before it existed, or restored from an older backup) are never forced through it.
        await saveFirstSessionState({ completed: false, planLater: false }, mk);
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
