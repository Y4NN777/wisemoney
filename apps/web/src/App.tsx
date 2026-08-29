import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import KeyUnlock from "./components/KeyUnlock/index.tsx";
import { Toaster } from "./components/ui/sonner.tsx";
import { useTranslation } from "react-i18next";
import {
  clearPwaUpdateReload,
  consumePwaUpdateReload,
  getPwaUpdateDisposition,
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

const UPDATE_TOAST_ID = "wisemoney-update-ready";
const UPDATE_INSTALLED_TOAST_ID = "wisemoney-update-installed";

function PwaUpdateHandler({ vaultUnlocked }: { vaultUnlocked: boolean }) {
  const { t } = useTranslation();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const vaultUnlockedRef = useRef(vaultUnlocked);
  const updateApprovedRef = useRef(false);
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
    if (!consumePwaUpdateReload()) return;
    toast.success(t("app.updateInstalled"), {
      id: UPDATE_INSTALLED_TOAST_ID,
      description: t("app.updateInstalledDescription"),
      action: {
        label: t("app.viewUpdates"),
        onClick: () => openUpdates(PRODUCT_VERSION),
      },
      duration: 8000,
    });
  }, [t]);

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

  useEffect(() => {
    const disposition = getPwaUpdateDisposition(needRefresh, vaultUnlocked);
    if (disposition === "idle") return;

    const installUpdate = (approvedWhileUnlocked: boolean) => {
      updateApprovedRef.current = approvedWhileUnlocked;
      markPwaUpdateReload();
      toast.loading(t("app.updateInstalling"), {
        id: UPDATE_TOAST_ID,
        description: t("app.updateInstallingDescription"),
        duration: Infinity,
      });
      void updateServiceWorker(true).catch(() => {
        updateApprovedRef.current = false;
        clearPwaUpdateReload();
        toast.error(t("app.updateFailed"), {
          id: UPDATE_TOAST_ID,
          description: t("app.updateFailedDescription"),
        });
      });
    };

    if (disposition === "activate") {
      installUpdate(false);
      return;
    }
    toast(t("app.updateAvailable"), {
      id: UPDATE_TOAST_ID,
      description: t("app.updateDescription"),
      action: {
        label: t("app.updateNow"),
        onClick: () => {
          installUpdate(true);
        },
      },
      cancel: {
        label: t("app.updateLater"),
        onClick: () => toast.dismiss(UPDATE_TOAST_ID),
      },
      duration: Infinity,
    });
  }, [needRefresh, t, updateServiceWorker, vaultUnlocked]);

  return null;
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
