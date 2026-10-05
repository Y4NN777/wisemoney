import { lazy, Suspense, useEffect } from "react";
import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import KeyUnlock from "../components/KeyUnlock/index.tsx";
import { useVaultUnlockedSetter } from "../lib/vaultUnlocked.ts";

const loadVaultShell = () => import("./vaultShell.tsx");
const VaultShell = lazy(loadVaultShell);

/**
 * Pathless layout route: every app route renders inside the vault gate, public
 * routes (/help, /updates) are root children outside it. The gate is therefore
 * part of the match tree itself and cannot be bypassed during lazy navigations.
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: "_vault",
  component: VaultRoot,
});

function VaultRoot() {
  const setVaultUnlocked = useVaultUnlockedSetter();
  // The shell is fetched while the visitor reads the landing page or types the passphrase,
  // so opening the space never waits on it.
  useEffect(() => { void loadVaultShell(); }, []);
  return (
    <KeyUnlock onVaultUnlockedChange={setVaultUnlocked}>
      <Suspense fallback={null}>
        <VaultShell />
      </Suspense>
    </KeyUnlock>
  );
}
