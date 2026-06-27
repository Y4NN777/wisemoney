import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import KeyUnlock from "./components/KeyUnlock/index.tsx";

function PwaUpdateHandler() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast("Update available", {
      description: "A new version is ready. Reload to apply.",
      action: {
        label: "Reload",
        onClick: () => {
          updateServiceWorker(true);
          window.location.reload();
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
      <PwaUpdateHandler />
      <KeyUnlock />
    </>
  );
}
