import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import {
  deriveMasterKey,
  setupMasterKey,
  verifyPassphrase,
  unwrapMasterKeyWithWebAuthn,
} from "../../crypto/keyManagement.ts";
import type { MasterKey } from "../../crypto/envelope.ts";
import { db } from "../../db/schema.ts";
import { register, restoreSession } from "../../auth/session.ts";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "../../router.ts";
import { MasterKeyContext } from "../../lib/masterKeyContext.ts";
import { Toaster } from "../../components/ui/sonner.tsx";
import { seedDefaultCategories } from "../../pillars/state/index.ts";
import { ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronUp, Download, Eye, EyeOff, LayoutDashboard, PiggyBank, ReceiptText, Settings, ShieldCheck, WalletCards, WifiOff } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import Logo from "../../components/Logo.tsx";

type Flow =
  | "loading"
  | "landing"
  | "setup"
  | "unlock-passphrase"
  | "unlock-webauthn"
  | "app";

export default function KeyUnlock() {
  const [flow, setFlow] = useState<Flow>("loading");
  const [error, setError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState<MasterKey | null>(null);
  const [vaultUnlockFlow, setVaultUnlockFlow] = useState<"setup" | "unlock-passphrase" | "unlock-webauthn">("setup");

  useEffect(() => {
    void db.keyMeta.get("primary").then((meta) => {
      if (meta == null) {
        setVaultUnlockFlow("setup");
      } else if (meta.webAuthnHandle != null) {
        setVaultUnlockFlow("unlock-webauthn");
      } else {
        setVaultUnlockFlow("unlock-passphrase");
      }
      setFlow("landing");
    });
  }, []);

  let content: React.ReactNode;

  if (flow === "loading") {
    content = (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4" aria-live="polite">
        <Logo className="w-56 h-auto" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  } else if (flow === "landing") {
    content = <LandingOnboarding onStart={() => setFlow(vaultUnlockFlow)} hasVault={vaultUnlockFlow !== "setup"} />;
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
      <Toaster />
      {content}
    </>
  );
}

type LandingOnboardingProps = {
  onStart: () => void;
  hasVault: boolean;
};

function LandingOnboarding({ onStart, hasVault }: LandingOnboardingProps) {
  const primaryLabel = hasVault ? "Open vault" : "Create local vault";

  return (
    <main aria-label="WiseMoney introduction" className="landing-grid min-h-dvh bg-white text-[#111111]">
      <section className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-[#111111] py-3">
          <Logo className="h-8 w-auto" />
          <Button type="button" onClick={onStart} className="h-9 rounded-none bg-[#002FA7] px-4 text-white hover:bg-[#002FA7]/90">
            {hasVault ? "Open app" : "Start"}
          </Button>
        </header>

        <div className="grid flex-1 gap-0 border-b border-[#111111] lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <div className="flex flex-col justify-between border-[#111111] py-8 lg:border-r lg:py-12 lg:pr-10">
            <div className="space-y-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#002FA7]">Local-first finance PWA</p>
              <h1 className="max-w-4xl text-5xl font-bold leading-[0.94] tracking-normal text-[#111111] sm:text-7xl lg:text-8xl">
                WiseMoney starts with your device, not a login wall.
              </h1>
              <p className="max-w-2xl text-base font-medium leading-relaxed text-[#333333] sm:text-lg">
                Build your private money workspace first: dashboard, capture, budgets, goals, recurring payments, exports, and settings all unlock from one encrypted vault.
              </p>
              {hasVault && (
                <p className="max-w-2xl border-l-4 border-[#002FA7] pl-4 text-base font-medium leading-relaxed text-[#333333]">
                  A vault already exists in this browser. Open it to continue with your local data.
                </p>
              )}
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
              <Button type="button" onClick={onStart} className="h-12 justify-between rounded-none bg-[#002FA7] px-4 text-white hover:bg-[#002FA7]/90">
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <a
                href="#pwa-onboarding"
                className="flex h-12 items-center justify-between border border-[#111111] px-4 text-sm font-semibold transition-colors hover:bg-[#F7F7F8]"
              >
                View setup steps
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <aside id="pwa-onboarding" className="grid content-start gap-4 py-6 lg:py-12 lg:pl-8">
            <div className="border border-[#111111] bg-white">
              <div className="border-b border-[#111111] bg-[#002FA7] p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">After setup</p>
                <h2 className="mt-2 text-2xl font-bold leading-tight">Your WiseMoney workspace</h2>
              </div>
              <div className="grid grid-cols-2">
                <ProductTile icon={<LayoutDashboard className="h-5 w-5" />} label="Dashboard" />
                <ProductTile icon={<ReceiptText className="h-5 w-5" />} label="Capture" />
                <ProductTile icon={<WalletCards className="h-5 w-5" />} label="Accounts" />
                <ProductTile icon={<PiggyBank className="h-5 w-5" />} label="Planning" />
                <ProductTile icon={<Bot className="h-5 w-5" />} label="Assistant" />
                <ProductTile icon={<Settings className="h-5 w-5" />} label="Settings" />
              </div>
            </div>
            <div className="border border-[#111111] bg-[#F7F7F8]">
              <OnboardingRow
                number="01"
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Create an encrypted vault"
                body="Your financial records are sealed on this device with a passphrase you control."
              />
              <OnboardingRow
                number="02"
                icon={<WifiOff className="h-5 w-5" />}
                title="Use the app offline"
                body="Capture transactions, manage accounts, and review budgets without waiting for a server."
              />
              <OnboardingRow
                number="03"
                icon={<Bot className="h-5 w-5" />}
                title="Add AI when ready"
                body="Use personal provider keys now, then connect the managed edge when the backend is deployed."
              />
              <OnboardingRow
                number="04"
                icon={<Download className="h-5 w-5" />}
                title="Install as a PWA"
                body="After setup, install WiseMoney from your browser menu for a full-screen app experience."
                isLast
              />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ProductTile({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-24 flex-col justify-between border-b border-r border-[#111111] p-3 last:border-r-0 even:border-r-0">
      <span className="text-[#002FA7]">{icon}</span>
      <span className="text-sm font-bold text-[#111111]">{label}</span>
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
    <article className={`landing-step grid grid-cols-[4rem_1fr] gap-0 ${isLast ? "" : "border-b border-[#111111]"}`}>
      <div className="border-r border-[#111111] p-3 text-2xl font-bold tabular-nums text-[#002FA7]">{number}</div>
      <div className="p-4">
        <div className="mb-4 flex h-9 w-9 items-center justify-center border border-[#111111] bg-white text-[#002FA7]">
          {icon}
        </div>
        <h2 className="text-lg font-bold leading-tight text-[#111111]">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#333333]">{body}</p>
      </div>
    </article>
  );
}

function AuthTopBar({ onBack }: { onBack: () => void }) {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-border py-3">
      <Logo className="h-8 w-auto" />
      <Button type="button" variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to overview
      </Button>
    </header>
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
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passphrase.length === 0) {
      setError("Passphrase is required");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match");
      return;
    }
    setSubmitting(true);
    void (async () => {
      try {
        const mk = await setupMasterKey(passphrase);
        await onReady(mk);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Setup failed");
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <main aria-label="Setup vault" className="flex min-h-dvh flex-col bg-background p-4">
      <AuthTopBar onBack={onBack} />
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <Logo className="w-48 h-auto" />
      <Card className="metric-surface w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set Up Your Vault</CardTitle>
          <CardDescription>
            Create an encryption passphrase to secure your financial data on this device.
            No account required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error != null && (
            <p role="alert" className="text-destructive text-sm mb-4">{error}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-passphrase">Encryption passphrase</Label>
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
              <Label htmlFor="confirm-passphrase">Confirm passphrase</Label>
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
              This passphrase encrypts all financial data on this device. It
              cannot be recovered if lost — save it securely.
            </p>
            <Button type="submit" disabled={submitting || passphrase.length === 0} className="w-full">
              {submitting ? "Setting up…" : "Create Vault"}
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
        Edge account linked
      </p>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (email.length === 0 || password.length === 0) {
      setError("Email and password are required");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    void (async () => {
      try {
        await register(email, password);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Registration failed");
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
        <span>Cloud sync (optional)</span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {expanded && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-4 px-1 pb-1">
          {error != null && (
            <p role="alert" className="text-destructive text-sm">{error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="edge-email">Email</Label>
            <Input
              id="edge-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edge-password">Password</Label>
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
                aria-label={passwordsVisible ? "Hide password" : "Show password"}
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
            <Label htmlFor="edge-confirm-password">Confirm password</Label>
            <Input
              id="edge-confirm-password"
              type={passwordsVisible ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full" variant="secondary">
            {submitting ? "Connecting…" : "Create Edge Account"}
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
  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passphrase.length === 0) {
      setError("Passphrase is required");
      return;
    }
    setSubmitting(true);
    void (async () => {
      try {
        const valid = await verifyPassphrase(passphrase);
        if (!valid) {
          setError("Incorrect passphrase");
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
        setError(err instanceof Error ? err.message : "Unlock failed");
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <main aria-label="Unlock vault" className="flex min-h-dvh flex-col bg-background p-4">
      <AuthTopBar onBack={onBack} />
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <Logo className="w-48 h-auto" />
      <Card className="metric-surface w-full max-w-sm">
        <CardHeader>
          <CardTitle>Unlock Vault</CardTitle>
          <CardDescription>Enter your encryption passphrase to access your financial data</CardDescription>
        </CardHeader>
        <CardContent>
          {error != null && (
            <p role="alert" className="text-destructive text-sm mb-4">{error}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unlock-passphrase">Encryption passphrase</Label>
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
              {submitting ? "Unlocking…" : "Unlock"}
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
          setError("WebAuthn not configured");
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
          err instanceof Error ? err.message : "WebAuthn unlock failed",
        );
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <main aria-label="Unlock vault" className="flex min-h-dvh flex-col bg-background p-4">
      <AuthTopBar onBack={onBack} />
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <Logo className="w-48 h-auto" />
      <Card className="metric-surface w-full max-w-sm">
        <CardHeader>
          <CardTitle>Unlock Vault</CardTitle>
          <CardDescription>Use your biometric or security key to access your financial data</CardDescription>
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
            {submitting ? "Authenticating…" : "Use biometric / security key"}
          </Button>
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
