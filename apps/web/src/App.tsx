import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import KeyUnlock from "./components/KeyUnlock/index.tsx";
import { Toaster } from "./components/ui/sonner.tsx";
import { Button } from "./components/ui/button.tsx";
import { useTranslation } from "react-i18next";
import {
  clearPwaUpdateReload,
  getPwaUpdateDisposition,
  hasPwaUpdateReload,
  markPwaUpdateReload,
  shouldReloadAfterControllerChange,
} from "./pwa/updatePolicy.ts";
import HelpPage from "./help/HelpPage.tsx";
import { HELP_NAVIGATION_EVENT, isHelpPath } from "./help/navigation.ts";
import { PwaInstallProvider } from "./pwa/install.tsx";
import { notifyReminderQueueUpdated, registerReminderPeriodicSync } from "./pwa/reminderQueue.ts";
import UpdatesPage from "./releases/UpdatesPage.tsx";
import { openUpdates, UPDATES_NAVIGATION_EVENT, isUpdatesPath } from "./releases/navigation.ts";
import { PRODUCT_VERSION } from "./releases/releaseNotes.ts";
import { WiseBotProvider } from "./help/WiseBotProvider.tsx";
import { Check, Download, LoaderCircle, RotateCcw, X } from "lucide-react";

type UpdateStage = "hidden" | "available" | "installing" | "finalizing" | "installed" | "failed";

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
  const title = stage === "available"
    ? t("app.updateAvailable")
    : stage === "installing"
      ? t("app.updateInstalling")
      : stage === "finalizing"
        ? t("app.updateFinalizing")
        : stage === "installed"
          ? t("app.updateInstalled")
          : t("app.updateFailed");
  const description = stage === "available"
    ? t("app.updateDescription")
    : stage === "installing"
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
        <div className={`h-full bg-ocean-primary transition-[width] duration-500 ${stage === "available" ? "w-1/4" : installing ? "w-2/3" : "w-full"}`} />
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
              {stage === "available" && <Button type="button" size="sm" onClick={onInstall}>{t("app.updateNow")}</Button>}
              {stage === "failed" && <Button type="button" size="sm" onClick={onInstall}>{t("app.updateRetry")}</Button>}
              {stage === "installed" && <Button type="button" size="sm" variant="outline" onClick={onViewUpdates}>{t("app.viewUpdates")}</Button>}
              {(stage === "available" || stage === "failed") && <Button type="button" size="sm" variant="ghost" onClick={onLater}>{t("app.updateLater")}</Button>}
            </div>
          )}
        </div>
        {!installing && (
          <button type="button" className="interactive-surface -mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground" onClick={onDismiss} aria-label={t("app.updateDismiss")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

function PwaUpdateHandler({ vaultUnlocked }: { vaultUnlocked: boolean }) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [stage, setStage] = useState<UpdateStage>(() => hasPwaUpdateReload() ? "installed" : "hidden");
  const [deferred, setDeferred] = useState(false);
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
    const interval = window.setInterval(checkForUpdate, 5 * 60 * 1000);
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
    setDeferred(false);
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
    if (!deferred && !installStartedRef.current) setStage("available");
  }, [deferred, installUpdate, needRefresh, vaultUnlocked]);

  if (stage === "hidden") return null;
  return <PwaUpdateNotice
    stage={stage}
    onInstall={() => installUpdate(vaultUnlocked)}
    onLater={() => { setDeferred(true); setStage("hidden"); }}
    onViewUpdates={() => {
      clearPwaUpdateReload();
      setStage("hidden");
      openUpdates(PRODUCT_VERSION);
    }}
    onDismiss={() => {
      if (stage === "installed") clearPwaUpdateReload();
      else setDeferred(true);
      setStage("hidden");
    }}
  />;
}

export default function App() {
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [publicPage, setPublicPage] = useState<"help" | "updates" | null>(() => {
    if (isHelpPath()) return "help";
    if (isUpdatesPath()) return "updates";
    return null;
  });

  useEffect(() => {
    const updateRoute = () => {
      if (isHelpPath()) setPublicPage("help");
      else if (isUpdatesPath()) setPublicPage("updates");
      else setPublicPage(null);
    };
    window.addEventListener("popstate", updateRoute);
    window.addEventListener(HELP_NAVIGATION_EVENT, updateRoute);
    window.addEventListener(UPDATES_NAVIGATION_EVENT, updateRoute);
    return () => {
      window.removeEventListener("popstate", updateRoute);
      window.removeEventListener(HELP_NAVIGATION_EVENT, updateRoute);
      window.removeEventListener(UPDATES_NAVIGATION_EVENT, updateRoute);
    };
  }, []);

  return (
    <PwaInstallProvider>
      <WiseBotProvider vaultUnlocked={vaultUnlocked}>
        <Toaster />
        <PwaUpdateHandler vaultUnlocked={vaultUnlocked} />
        <div hidden={publicPage != null} aria-hidden={publicPage != null}>
          <KeyUnlock onVaultUnlockedChange={setVaultUnlocked} />
        </div>
        <div hidden={publicPage !== "help"} aria-hidden={publicPage !== "help"}>
          <HelpPage visible={publicPage === "help"} />
        </div>
        <div hidden={publicPage !== "updates"} aria-hidden={publicPage !== "updates"}>
          <UpdatesPage visible={publicPage === "updates"} />
        </div>
      </WiseBotProvider>
    </PwaInstallProvider>
  );
}
