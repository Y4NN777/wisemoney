import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SurfaceId } from "./corpus.ts";
import type { AppFaultCode, HelpEntryPoint } from "./context.ts";
import type { WiseBotRequest } from "./HelpChatHost.tsx";

// The panel and the help corpus are not needed to paint a page: they load right after it.
const HelpChatHost = lazy(() => import("./HelpChatHost.tsx"));

export type WiseBotOpenInput = {
  entryPoint?: HelpEntryPoint;
  surfaceId?: SurfaceId;
  taskId?: string;
  faultCode?: AppFaultCode;
  prompt?: string;
};

type WiseBotContextValue = {
  isOpen: boolean;
  openWiseBot: (input?: WiseBotOpenInput) => void;
  closeWiseBot: () => void;
  /** Hides the floating launcher until the returned function is called. */
  hideLauncher: () => () => void;
};

const WiseBotContext = createContext<WiseBotContextValue | null>(null);
const WISEBOT_OPEN_EVENT = "wisemoney:wisebot-open";

export function requestWiseBot(input: WiseBotOpenInput = {}): void {
  window.dispatchEvent(new CustomEvent<WiseBotOpenInput>(WISEBOT_OPEN_EVENT, { detail: input }));
}

export function WiseBotProvider({ children, vaultUnlocked }: { children: ReactNode; vaultUnlocked: boolean }) {
  const { i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith("fr") ? "fr" : "en";
  const [isOpen, setIsOpen] = useState(false);
  const [launcherHolds, setLauncherHolds] = useState(0);
  const [request, setRequest] = useState<WiseBotRequest>(() => ({
    id: 0,
    prompt: "",
    taskId: null,
    surfaceId: "help",
  }));

  const openWiseBot = useCallback((input: WiseBotOpenInput = {}) => {
    setRequest((current) => ({
      id: current.id + 1,
      prompt: input.prompt ?? "",
      taskId: input.taskId ?? null,
      ...(input.entryPoint == null ? {} : { entryPoint: input.entryPoint }),
      ...(input.surfaceId == null ? {} : { surfaceId: input.surfaceId }),
      ...(input.faultCode == null ? {} : { faultCode: input.faultCode }),
    }));
    setIsOpen(true);
  }, []);

  const closeWiseBot = useCallback(() => setIsOpen(false), []);
  const hideLauncher = useCallback(() => {
    setLauncherHolds((count) => count + 1);
    return () => setLauncherHolds((count) => Math.max(0, count - 1));
  }, []);

  useEffect(() => {
    const openFromEvent = (event: Event) => openWiseBot((event as CustomEvent<WiseBotOpenInput>).detail ?? {});
    window.addEventListener(WISEBOT_OPEN_EVENT, openFromEvent);
    return () => window.removeEventListener(WISEBOT_OPEN_EVENT, openFromEvent);
  }, [openWiseBot]);
  const value = useMemo(() => ({ isOpen, openWiseBot, closeWiseBot, hideLauncher }), [closeWiseBot, hideLauncher, isOpen, openWiseBot]);

  return (
    <WiseBotContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <HelpChatHost
          locale={locale}
          request={request}
          vaultUnlocked={vaultUnlocked}
          launcherHidden={launcherHolds > 0}
          onOpenChange={setIsOpen}
        />
      </Suspense>
    </WiseBotContext.Provider>
  );
}

export function useWiseBot(): WiseBotContextValue {
  const value = useContext(WiseBotContext);
  if (value == null) throw new Error("useWiseBot must be used within WiseBotProvider");
  return value;
}

/**
 * A page with its own chat composer (the Learn tutor) hides the floating WiseBot launcher while it
 * is mounted: the launcher sat on top of the send button at 375 px. WiseBot stays reachable from
 * the header help button.
 */
export function useHideWiseBotLauncher(): void {
  const { hideLauncher } = useWiseBot();
  useEffect(() => hideLauncher(), [hideLauncher]);
}
