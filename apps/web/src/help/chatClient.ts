import type { HelpSection } from "./corpus.ts";
import type { SafeHelpContext } from "./context.ts";

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
  safeContext: SafeHelpContext;
  signal?: AbortSignal;
};

export type HelpStreamMeta = { taskIds: string[] };

function consumeSseFrames(buffer: string, onText: (text: string) => void, onMeta?: (meta: HelpStreamMeta) => void): string {
  const normalized = buffer.replaceAll("\r\n", "\n");
  const frames = normalized.split("\n\n");
  const remainder = frames.pop() ?? "";
  for (const frame of frames) {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (data.length === 0) continue;
    try {
      const value = JSON.parse(data.join("\n")) as { text?: unknown; taskIds?: unknown };
      if (event === "delta" && typeof value.text === "string") onText(value.text);
      if (event === "meta" && Array.isArray(value.taskIds)) {
        onMeta?.({ taskIds: value.taskIds.filter((id): id is string => typeof id === "string").slice(0, 4) });
      }
    } catch {
      // Invalid frames never become visible provider output.
    }
  }
  return remainder;
}

export async function streamHelpMessage(
  input: SendMessageInput,
  onText: (text: string) => void,
  onMeta?: (meta: HelpStreamMeta) => void,
): Promise<void> {
  const response = await fetch("/api/help/messages", {
    method: "POST",
    ...(input.signal == null ? {} : { signal: input.signal }),
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({
      question: input.question,
      ...(input.imageDataUrl == null ? {} : { image: input.imageDataUrl }),
      locale: input.locale,
      history: input.history.slice(-8),
      helpContext: input.sections.map(({ id }) => ({ id })),
      safeContext: input.safeContext,
    }),
  });

  if (!response.ok || response.body == null) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message ?? "help-unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });
    buffer = consumeSseFrames(buffer, onText, onMeta);
  }
  buffer += decoder.decode();
  consumeSseFrames(`${buffer}\n\n`, onText, onMeta);
}
