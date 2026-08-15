import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type InstallPlatform = "ios" | "android" | "desktop";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallContextValue = {
  canPrompt: boolean;
  installed: boolean;
  platform: InstallPlatform;
  promptInstall: () => Promise<boolean>;
};

const InstallContext = createContext<InstallContextValue | null>(null);

export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const normalized = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(normalized) || (/macintosh/.test(normalized) && maxTouchPoints > 1)) {
    return "ios";
  }
  if (/android/.test(normalized)) return "android";
  return "desktop";
}

export function isInstalledDisplayMode(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isInstalledDisplayMode());

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateDisplayMode = () => setInstalled(isInstalledDisplayMode());
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayMode.addEventListener("change", updateDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayMode.removeEventListener("change", updateDisplayMode);
    };
  }, []);

  const value = useMemo<InstallContextValue>(() => ({
    canPrompt: installPrompt != null,
    installed,
    platform: detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints),
    promptInstall: async () => {
      if (installPrompt == null) return false;
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        return choice.outcome === "accepted";
      } finally {
        setInstallPrompt(null);
      }
    },
  }), [installPrompt, installed]);

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function usePwaInstall(): InstallContextValue {
  const value = useContext(InstallContext);
  if (value == null) throw new Error("usePwaInstall must be used inside PwaInstallProvider");
  return value;
}

