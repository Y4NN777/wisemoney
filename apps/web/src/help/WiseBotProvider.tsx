import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import HelpChat from "./HelpChat.tsx";
import { getHelpSections, getProductTask, type SurfaceId } from "./corpus.ts";
import { createSafeHelpContext, type AppFaultCode, type HelpEntryPoint } from "./context.ts";

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
  const sections = useMemo(() => getHelpSections(locale), [locale]);
  const [isOpen, setIsOpen] = useState(false);
  const [launcherHolds, setLauncherHolds] = useState(0);
  const [request, setRequest] = useState(() => ({
    id: 0,
    prompt: "",
    context: createSafeHelpContext({ locale, surfaceId: "help" }),
  }));

  const openWiseBot = useCallback((input: WiseBotOpenInput = {}) => {
    const task = input.taskId == null ? null : getProductTask(locale, input.taskId);
    const prompt = input.prompt ?? (task == null ? "" : locale === "fr"
      ? `Comment utiliser « ${task.title} » ?`
      : `How do I use “${task.title}”?`);
    setRequest((current) => ({
      id: current.id + 1,
      prompt,
      context: createSafeHelpContext({
        locale,
        ...(input.entryPoint == null ? {} : { entryPoint: input.entryPoint }),
        ...(input.surfaceId == null ? {} : { surfaceId: input.surfaceId }),
        ...(input.taskId == null ? {} : { taskId: input.taskId }),
        ...(input.faultCode == null ? {} : { faultCode: input.faultCode }),
      }),
    }));
    setIsOpen(true);
  }, [locale]);

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
      <HelpChat
        sections={sections}
        openRequest={request.id}
        initialPrompt={request.prompt}
        safeContext={request.context}
        vaultUnlocked={vaultUnlocked}
        launcherHidden={launcherHolds > 0}
        onOpenChange={setIsOpen}
      />
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
