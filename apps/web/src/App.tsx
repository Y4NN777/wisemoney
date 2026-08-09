import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import KeyUnlock from "./components/KeyUnlock/index.tsx";
import { Toaster } from "./components/ui/sonner.tsx";
import { useTranslation } from "react-i18next";
import { getPwaUpdateDisposition, shouldReloadAfterControllerChange } from "./pwa/updatePolicy.ts";

const UPDATE_TOAST_ID = "wisemoney-update-ready";

function PwaUpdateHandler({ vaultUnlocked }: { vaultUnlocked: boolean }) {
  const { t } = useTranslation();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const vaultUnlockedRef = useRef(vaultUnlocked);
  vaultUnlockedRef.current = vaultUnlocked;
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      setRegistration(registration ?? null);
    },
    onNeedReload() {
      if (shouldReloadAfterControllerChange(vaultUnlockedRef.current)) {
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
    const interval = window.setInterval(checkForUpdate, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [registration]);

  useEffect(() => {
    const disposition = getPwaUpdateDisposition(needRefresh, vaultUnlocked);
    if (disposition === "idle") return;
    if (disposition === "activate") {
      toast.dismiss(UPDATE_TOAST_ID);
      void updateServiceWorker(true);
      return;
    }
    toast(t("app.updateAvailable"), {
      id: UPDATE_TOAST_ID,
      description: t("app.updateDescription"),
      action: {
        label: t("app.continue"),
        onClick: () => {
          toast.dismiss(UPDATE_TOAST_ID);
        },
      },
      duration: Infinity,
    });
  }, [needRefresh, t, updateServiceWorker, vaultUnlocked]);

  return null;
}

export default function App() {
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  return (
    <>
      <Toaster />
      <PwaUpdateHandler vaultUnlocked={vaultUnlocked} />
      <KeyUnlock onVaultUnlockedChange={setVaultUnlocked} />
    </>
  );
}
