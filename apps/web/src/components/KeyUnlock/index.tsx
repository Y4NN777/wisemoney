import { useState, useEffect, type FormEvent } from "react";
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
import { Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import Logo from "../../components/Logo.tsx";

type Flow =
  | "loading"
  | "setup"
  | "unlock-passphrase"
  | "unlock-webauthn"
  | "app";

export default function KeyUnlock() {
  const [flow, setFlow] = useState<Flow>("loading");
  const [error, setError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState<MasterKey | null>(null);

  useEffect(() => {
    void db.keyMeta.get("primary").then((meta) => {
      if (meta == null) {
        setFlow("setup");
      } else if (meta.webAuthnHandle != null) {
        setFlow("unlock-webauthn");
      } else {
        setFlow("unlock-passphrase");
      }
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
  } else if (flow === "setup") {
    content = (
      <LocalSetup
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
  onReady: (masterKey: MasterKey) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
};

function LocalSetup({ onReady, error, setError }: LocalSetupProps) {
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
    <main aria-label="Setup vault" className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background p-4">
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
  onUnlock: (masterKey: MasterKey) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
};

function PassphraseUnlock({ onUnlock, error, setError }: PassphraseUnlockProps) {
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
    <main aria-label="Unlock vault" className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background p-4">
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
    </main>
  );
}

type WebAuthnUnlockProps = {
  onUnlock: (masterKey: MasterKey) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
};

function WebAuthnUnlock({ onUnlock, error, setError }: WebAuthnUnlockProps) {
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
    <main aria-label="Unlock vault" className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background p-4">
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
    </main>
  );
}
