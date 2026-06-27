import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import KeyUnlock from "./components/KeyUnlock/index.tsx";
import { Toaster } from "./components/ui/sonner.tsx";

function PwaUpdateHandler() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      if (registration === undefined) return;

      const checkForUpdate = () => {
        void registration.update();
      };
      const checkWhenVisible = () => {
        if (document.visibilityState === "visible") {
          checkForUpdate();
        }
      };

      checkForUpdate();
      window.setInterval(checkForUpdate, 60 * 60 * 1000);
      document.addEventListener("visibilitychange", checkWhenVisible);
    },
    onNeedReload() {
      window.location.reload();
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast("Update available", {
      description: "A new version is ready. Reload to apply.",
      action: {
        label: "Reload",
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      duration: Infinity,
    });
  }, [needRefresh, updateServiceWorker]);

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
