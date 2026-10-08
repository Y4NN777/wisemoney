import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "./components/ui/button.tsx";
import { useTranslation } from "react-i18next";
import {
  clearPwaUpdateReload,
  getPwaUpdateDisposition,
  hasPwaUpdateReload,
  markPwaUpdateReload,
  shouldReloadAfterControllerChange,
} from "./pwa/updatePolicy.ts";
import { PwaInstallProvider } from "./pwa/install.tsx";
import { notifyReminderQueueUpdated, registerReminderPeriodicSync } from "./pwa/reminderQueue.ts";
import { openUpdates } from "./releases/navigation.ts";
import { PRODUCT_VERSION } from "./releases/releaseNotes.ts";
import { WiseBotProvider } from "./help/WiseBotProvider.tsx";
import { router } from "./router.ts";
import { VaultUnlockedSetterContext } from "./lib/vaultUnlocked.ts";
import { Check, Download, LoaderCircle, RotateCcw, X } from "lucide-react";

// Toasts only fire from inside the app, so the toast library loads after the first paint.
const Toaster = lazy(() => import("./components/ui/sonner.tsx").then((module) => ({ default: module.Toaster })));

type UpdateStage = "hidden" | "installing" | "finalizing" | "installed" | "failed";

function PwaUpdateNotice({
  stage,
  onInstall,
  onLater,
  onDismiss,
  onViewUpdates,
}: {
  stage: Exclude<UpdateStage, "hidden">;
  onInstall: () => void;
  onLater: () => void;
  onDismiss: () => void;
  onViewUpdates: () => void;
}) {
  const { t } = useTranslation();
  const installing = stage === "installing" || stage === "finalizing";
  const Icon = stage === "installed" ? Check : stage === "failed" ? RotateCcw : installing ? LoaderCircle : Download;
  const title = stage === "installing"
      ? t("app.updateInstalling")
      : stage === "finalizing"
        ? t("app.updateFinalizing")
        : stage === "installed"
          ? t("app.updateInstalled")
          : t("app.updateFailed");
  const description = stage === "installing"
      ? t("app.updateInstallingDescription")
      : stage === "finalizing"
        ? t("app.updateFinalizingDescription")
        : stage === "installed"
          ? t("app.updateInstalledDescription")
          : t("app.updateFailedDescription");

  return (
    <aside
      role={stage === "failed" ? "alert" : "status"}
      aria-live={stage === "failed" ? "assertive" : "polite"}
      className="motion-enter fixed inset-x-3 top-[calc(var(--safe-area-top)+0.75rem)] z-[90] mx-auto max-w-xl overflow-hidden rounded-lg border border-ocean-primary/40 bg-card/95 text-card-foreground shadow-[0_18px_48px_rgba(16,24,32,0.22)] backdrop-blur-xl"
    >
      <div className="h-1 bg-ocean-wash" aria-hidden="true">
        <div className={`h-full bg-ocean-primary transition-[width] duration-500 ${installing ? "w-2/3" : "w-full"}`} />
      </div>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 p-3 sm:p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ocean-wash text-ocean-primary">
          <Icon className={`h-5 w-5 ${installing ? "animate-spin motion-reduce:animate-none" : ""}`} />
        </span>
        <div className="min-w-0 self-center">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          {!installing && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stage === "failed" && <Button type="button" size="sm" onClick={onInstall}>{t("app.updateRetry")}</Button>}
              {stage === "installed" && <Button type="button" size="sm" variant="outline" onClick={onViewUpdates}>{t("app.viewUpdates")}</Button>}
              {stage === "failed" && <Button type="button" size="sm" variant="ghost" onClick={onLater}>{t("app.updateLater")}</Button>}
            </div>
          )}
        </div>
        {!installing && (
          <button type="button" className="interactive-surface -mr-1 -mt-1 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground" onClick={onDismiss} aria-label={t("app.updateDismiss")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

/**
 * Detection latency dominates the perceived update time (measured 2026-09-26: the
 * install, activation and reboot take about two seconds, one of them a fixed Chromium
 * delay). A check is a conditional GET of the 32 KB worker script answered with 304,
 * so polling every minute while the app is open is cheap.
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;

function PwaUpdateHandler({ vaultUnlocked }: { vaultUnlocked: boolean }) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [stage, setStage] = useState<UpdateStage>(() => hasPwaUpdateReload() ? "installed" : "hidden");
  const vaultUnlockedRef = useRef(vaultUnlocked);
  const updateApprovedRef = useRef(false);
  const installStartedRef = useRef(false);
  const finalizingTimerRef = useRef<number | null>(null);
  vaultUnlockedRef.current = vaultUnlocked;
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      setRegistration(registration ?? null);
      if (registration != null) {
        notifyReminderQueueUpdated(registration);
        void registerReminderPeriodicSync(registration);
      }
    },
    onNeedReload() {
      if (shouldReloadAfterControllerChange(vaultUnlockedRef.current, updateApprovedRef.current)) {
        window.location.reload();
      }
    },
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

  useEffect(() => () => {
    if (finalizingTimerRef.current != null) window.clearTimeout(finalizingTimerRef.current);
  }, []);

  const installUpdate = useCallback((approvedWhileUnlocked: boolean) => {
    if (installStartedRef.current) return;
    installStartedRef.current = true;
    updateApprovedRef.current = approvedWhileUnlocked;
    markPwaUpdateReload();
    setStage("installing");
    finalizingTimerRef.current = window.setTimeout(() => {
      setStage((current) => current === "installing" ? "finalizing" : current);
    }, 8_000);
    void updateServiceWorker(true).catch(() => {
      installStartedRef.current = false;
      updateApprovedRef.current = false;
      if (finalizingTimerRef.current != null) window.clearTimeout(finalizingTimerRef.current);
      clearPwaUpdateReload();
      setStage("failed");
    });
  }, [updateServiceWorker]);

  useEffect(() => {
    const disposition = getPwaUpdateDisposition(needRefresh, vaultUnlocked);
    if (disposition === "idle") return;
    if (disposition === "activate") {
      installUpdate(false);
      return;
    }
    // While the vault is open the waiting version stays dormant and nothing is shown: reloading
    // would lock the vault and ask for the passphrase. It installs the next time WiseMoney opens
    // (vault locked), or as soon as the vault is locked (Y4NN, 2026-10-08: an update must not ask
    // for the passphrase again; handing the key over a reload was rejected, INV-KEY-03).
  }, [installUpdate, needRefresh, vaultUnlocked]);

  if (stage === "hidden") return null;
  return <PwaUpdateNotice
    stage={stage}
    onInstall={() => installUpdate(vaultUnlocked)}
    onLater={() => setStage("hidden")}
    onViewUpdates={() => {
      clearPwaUpdateReload();
      setStage("hidden");
      openUpdates(PRODUCT_VERSION);
    }}
    onDismiss={() => {
      if (stage === "installed") clearPwaUpdateReload();
      setStage("hidden");
    }}
  />;
}

export default function App() {
  const [vaultUnlocked, setVaultUnlocked] = useState(false);

  return (
    <PwaInstallProvider>
      <VaultUnlockedSetterContext.Provider value={setVaultUnlocked}>
        <WiseBotProvider vaultUnlocked={vaultUnlocked}>
          <Suspense fallback={null}><Toaster /></Suspense>
          <PwaUpdateHandler vaultUnlocked={vaultUnlocked} />
          <RouterProvider router={router} />
        </WiseBotProvider>
      </VaultUnlockedSetterContext.Provider>
    </PwaInstallProvider>
  );
}
