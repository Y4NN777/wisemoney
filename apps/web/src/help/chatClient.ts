import type { HelpSection } from "./corpus.ts";

export type HelpChatHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type TicketState = "waiting" | "admitted" | "cancelled" | "expired" | "processing" | "complete";

export type HelpTicket = {
  id: string;
  status: TicketState;
  position: number;
  estimatedWaitSeconds: number;
  remainingUnits: number;
  resetAt: string;
  expiresAt?: string;
};

type SendMessageInput = {
  question: string;
  imageDataUrl?: string;
  locale: "en" | "fr";
  history: HelpChatHistoryMessage[];
  sections: HelpSection[];
  signal?: AbortSignal;
};

export async function streamHelpMessage(
  input: SendMessageInput,
  onText: (text: string) => void,
): Promise<void> {
  const response = await fetch("/api/help/messages", {
    method: "POST",
    ...(input.signal == null ? {} : { signal: input.signal }),
    headers: { "content-type": "application/json", accept: "text/plain" },
    body: JSON.stringify({
      question: input.question,
      ...(input.imageDataUrl == null ? {} : { image: input.imageDataUrl }),
      locale: input.locale,
      history: input.history.slice(-8),
      helpContext: input.sections.map(({ id, title, summary, steps }) => ({ id, title, summary, steps })),
    }),
  });

  if (!response.ok || response.body == null) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message ?? "help-unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const text = decoder.decode(result.value, { stream: true });
    if (text.length > 0) onText(text);
  }
  const finalText = decoder.decode();
  if (finalText.length > 0) onText(finalText);
}
