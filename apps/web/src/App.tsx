import { lazy, Suspense, useEffect, useState } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { useRegisterSW } from "virtual:pwa-register/react";
import { PwaInstallProvider } from "./pwa/install.tsx";
import { notifyReminderQueueUpdated, registerReminderPeriodicSync } from "./pwa/reminderQueue.ts";
import { WiseBotProvider } from "./help/WiseBotProvider.tsx";
import { router } from "./router.ts";
import { VaultUnlockedSetterContext } from "./lib/vaultUnlocked.ts";

// Toasts only fire from inside the app, so the toast library loads after the first paint.
const Toaster = lazy(() => import("./components/ui/sonner.tsx").then((module) => ({ default: module.Toaster })));

/**
 * A check is a conditional GET of the 32 KB worker script answered with 304, so
 * polling every minute while the app is open is cheap.
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Downloads new versions and leaves them waiting; WiseMoney never activates or reloads one
 * itself. A reload locks the vault, and on 2026-10-08 an update that installed while the vault
 * was locked reloaded the page in the middle of an unlock and threw the typed passphrase away
 * (reproduced with two builds: reload 3.4 s after opening). The browser activates the waiting
 * version once every WiseMoney window is closed, so the next opening runs it with nothing lost
 * (Y4NN chose "never reload"; INV-KEY-03 rules out carrying the key across a reload).
 */
function PwaUpdateChecker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  useRegisterSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      setRegistration(registration ?? null);
      if (registration != null) {
        notifyReminderQueueUpdated(registration);
        void registerReminderPeriodicSync(registration);
      }
    },
    // Without this callback the plugin reloads the page when a new worker takes control.
    onNeedReload() {},
  });

  useEffect(() => {
    if (registration == null) return;
    const checkForUpdate = () => {
      void registration.update().catch(() => {
        // Update checks are best-effort when the device is offline.
      });
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    checkForUpdate();
    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkWhenVisible);
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      window.removeEventListener("focus", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
    };
  }, [registration]);

  return null;
}

export default function App() {
  const [vaultUnlocked, setVaultUnlocked] = useState(false);

  return (
    <PwaInstallProvider>
      <VaultUnlockedSetterContext.Provider value={setVaultUnlocked}>
        <WiseBotProvider vaultUnlocked={vaultUnlocked}>
          <Suspense fallback={null}><Toaster /></Suspense>
          <PwaUpdateChecker />
          <RouterProvider router={router} />
        </WiseBotProvider>
      </VaultUnlockedSetterContext.Provider>
    </PwaInstallProvider>
  );
}
