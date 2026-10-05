import { useMemo } from "react";
import HelpChat from "./HelpChat.tsx";
import { getHelpSections, getProductTask, type SurfaceId } from "./corpus.ts";
import { createSafeHelpContext, type AppFaultCode, type HelpEntryPoint } from "./context.ts";

export type WiseBotRequest = {
  id: number;
  /** A prompt given by the caller; empty when the prompt should be derived from `taskId`. */
  prompt: string;
  taskId: string | null;
  entryPoint?: HelpEntryPoint;
  surfaceId?: SurfaceId;
  faultCode?: AppFaultCode;
};

/**
 * The WiseBot panel together with the help corpus it answers from. Loaded as one chunk after
 * the first paint (see WiseBotProvider), so neither weighs on the landing page.
 */
export default function HelpChatHost({ locale, request, vaultUnlocked, launcherHidden, onOpenChange }: {
  locale: "en" | "fr";
  request: WiseBotRequest;
  vaultUnlocked: boolean;
  launcherHidden: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sections = useMemo(() => getHelpSections(locale), [locale]);
  const prompt = useMemo(() => {
    if (request.prompt !== "") return request.prompt;
    const task = request.taskId == null ? null : getProductTask(locale, request.taskId);
    if (task == null) return "";
    return locale === "fr" ? `Comment utiliser « ${task.title} » ?` : `How do I use “${task.title}”?`;
  }, [locale, request.prompt, request.taskId]);
  // Rebuilt per request and per language, exactly as when the provider built it on open.
  const safeContext = useMemo(() => createSafeHelpContext({
    locale,
    ...(request.entryPoint == null ? {} : { entryPoint: request.entryPoint }),
    ...(request.surfaceId == null ? {} : { surfaceId: request.surfaceId }),
    ...(request.taskId == null ? {} : { taskId: request.taskId }),
    ...(request.faultCode == null ? {} : { faultCode: request.faultCode }),
  }), [locale, request.entryPoint, request.faultCode, request.surfaceId, request.taskId]);
  return (
    <HelpChat
      sections={sections}
      openRequest={request.id}
      initialPrompt={prompt}
      safeContext={safeContext}
      vaultUnlocked={vaultUnlocked}
      launcherHidden={launcherHidden}
      onOpenChange={onOpenChange}
    />
  );
}
