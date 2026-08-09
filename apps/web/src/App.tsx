import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import KeyUnlock from "./components/KeyUnlock/index.tsx";
import { Toaster } from "./components/ui/sonner.tsx";
import { useTranslation } from "react-i18next";

function PwaUpdateHandler() {
  const { t } = useTranslation();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      setRegistration(registration ?? null);
    },
    onNeedReload() {
      window.location.reload();
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
    if (!needRefresh) return;
    toast(t("app.updateAvailable"), {
      description: t("app.updateDescription"),
      action: {
        label: t("app.reload"),
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      duration: Infinity,
    });
  }, [needRefresh, t, updateServiceWorker]);

  return null;
}

export default function App() {
  return (
    <>
      <Toaster />
      <PwaUpdateHandler />
      <KeyUnlock />
    </>
  );
}
