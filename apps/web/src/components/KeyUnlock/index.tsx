import { lazy, Suspense, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Logo from "../Logo.tsx";
import { isStandaloneDisplayMode } from "../../lib/displayMode.ts";
import { readVaultHint } from "../../lib/vaultHint.ts";
import { getCachedMasterKey } from "../../lib/vaultUnlocked.ts";
import LandingOnboarding from "./Landing.tsx";

const VaultGate = lazy(() => import("./VaultGate.tsx"));

function GateLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4" aria-live="polite">
      <Logo className="w-56 h-auto" />
      <p className="text-sm text-muted-foreground animate-pulse">{t("keyUnlock.loading")}</p>
    </div>
  );
}

type KeyUnlockProps = {
  onVaultUnlockedChange: (unlocked: boolean) => void;
  /** The unlocked application shell; rendered once the vault is open. */
  children: ReactNode;
};

/**
 * The vault gate. The landing page paints from this small module; the vault flows (storage,
 * key derivation, setup, unlock, restore) arrive in their own chunk and take over once they
 * know whether a space exists. A tap on Start before then is remembered and honoured.
 */
export default function KeyUnlock({ onVaultUnlockedChange, children }: KeyUnlockProps) {
  const [startRequested, setStartRequested] = useState(false);
  const [hasVaultHint] = useState(readVaultHint);
  // An installed app with no space opens on the restore screen, and a space still unlocked in
  // memory (back from a public page) reopens directly: neither passes through the landing page.
  const pending = (isStandaloneDisplayMode() && !hasVaultHint) || getCachedMasterKey() != null
    ? <GateLoading />
    : <LandingOnboarding hasVault={hasVaultHint} busy={startRequested} onStart={() => setStartRequested(true)} />;
  return (
    <Suspense fallback={pending}>
      <VaultGate
        onVaultUnlockedChange={onVaultUnlockedChange}
        pending={pending}
        startRequested={startRequested}
        onStartHandled={() => setStartRequested(false)}
      >
        {children}
      </VaultGate>
    </Suspense>
  );
}
