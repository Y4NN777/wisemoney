import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";
import { currentBuildId, takeUpdateNotice } from "./pwa/buildIdentity.ts";
import { PwaInstallProvider } from "./pwa/install.tsx";
import { hasInteracted, shouldActivateAtStartup, watchFirstInteraction } from "./pwa/startupUpdate.ts";
import { notifyReminderQueueUpdated, registerReminderPeriodicSync } from "./pwa/reminderQueue.ts";
import { openUpdates } from "./releases/navigation.ts";
import { PRODUCT_VERSION } from "./releases/releaseNotes.ts";
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

watchFirstInteraction();

/**
 * Downloads new versions and leaves them waiting. A reload locks the vault, and on 2026-10-08 an
 * update that installed mid-session reloaded the page during an unlock and threw the typed
 * passphrase away (reproduced with two builds: reload 3.4 s after opening). So a version that
 * arrives during a session is never installed then; one already waiting at the next opening is
 * installed before the first touch (see startupUpdate.ts). INV-KEY-03 rules out carrying the key
 * across a reload.
 */
function PwaUpdateChecker({ vaultUnlocked }: { vaultUnlocked: boolean }) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const vaultUnlockedRef = useRef(vaultUnlocked);
  vaultUnlockedRef.current = vaultUnlocked;
  useRegisterSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      setRegistration(registration ?? null);
      if (registration != null) {
        notifyReminderQueueUpdated(registration);
        void registerReminderPeriodicSync(registration);
        const waiting = registration.waiting;
        if (waiting != null && shouldActivateAtStartup(true, hasInteracted(), vaultUnlockedRef.current)) {
          // Reload even if a tap lands in the second this takes: the old page under the new worker
          // would ask for code files the new deployment no longer serves.
          navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
          waiting.postMessage({ type: "SKIP_WAITING" });
        }
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

const UPDATED_NOTICE_MS = 8_000;

/**
 * Tells the user, once, that WiseMoney changed since their last visit (Y4NN, 2026-10-08: a
 * silent update goes by "too fast"). It waits for the unlock so it never sits over the passphrase.
 */
function UpdatedNotice({ vaultUnlocked }: { vaultUnlocked: boolean }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!vaultUnlocked || !takeUpdateNotice(currentBuildId())) return;
    toast.success(t("app.updated"), {
      duration: UPDATED_NOTICE_MS,
      action: { label: t("app.viewUpdates"), onClick: () => openUpdates(PRODUCT_VERSION) },
    });
  }, [t, vaultUnlocked]);
  return null;
}

export default function App() {
  const [vaultUnlocked, setVaultUnlocked] = useState(false);

  return (
    <PwaInstallProvider>
      <VaultUnlockedSetterContext.Provider value={setVaultUnlocked}>
        <WiseBotProvider vaultUnlocked={vaultUnlocked}>
          <Suspense fallback={null}><Toaster /></Suspense>
          <PwaUpdateChecker vaultUnlocked={vaultUnlocked} />
          <UpdatedNotice vaultUnlocked={vaultUnlocked} />
          <RouterProvider router={router} />
        </WiseBotProvider>
      </VaultUnlockedSetterContext.Provider>
    </PwaInstallProvider>
  );
}
