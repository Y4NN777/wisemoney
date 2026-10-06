export type LiteracyLocale = "en" | "fr";

export type TutorTurn = { role: "user" | "assistant"; text: string };
export type TutorSource = { title: string; uri: string };
/** A lesson the server grounded the answer in, with the publishers its sources come from. */
export type TutorLesson = { id: string; title: string; publishers: string[] };
export type TutorMeta = { unitIds: string[]; webSearch: boolean; lessons: TutorLesson[] };

export type TutorStreamHandlers = {
  onText: (text: string) => void;
  onMeta?: (meta: TutorMeta) => void;
  onSources?: (sources: TutorSource[]) => void;
};

const MAX_HISTORY_TURNS = 8;

function consumeFrames(buffer: string, handlers: TutorStreamHandlers): string {
  const frames = buffer.replaceAll("\r\n", "\n").split("\n\n");
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
      const value = JSON.parse(data.join("\n")) as { text?: unknown; unitIds?: unknown; webSearch?: unknown; items?: unknown; lessons?: unknown };
      if (event === "delta" && typeof value.text === "string") handlers.onText(value.text);
      if (event === "meta" && Array.isArray(value.unitIds)) {
        const lessons = Array.isArray(value.lessons) ? value.lessons.flatMap((item) => {
          const { id, title, publishers } = (item ?? {}) as { id?: unknown; title?: unknown; publishers?: unknown };
          if (typeof id !== "string" || typeof title !== "string") return [];
          return [{ id, title, publishers: Array.isArray(publishers) ? publishers.filter((name): name is string => typeof name === "string") : [] }];
        }) : [];
        handlers.onMeta?.({ unitIds: value.unitIds.filter((id): id is string => typeof id === "string"), webSearch: value.webSearch === true, lessons });
      }
      if (event === "sources" && Array.isArray(value.items)) {
        handlers.onSources?.(value.items.flatMap((item) => {
          const { title, uri } = (item ?? {}) as { title?: unknown; uri?: unknown };
          return typeof title === "string" && typeof uri === "string" && uri.startsWith("https://") ? [{ title, uri }] : [];
        }));
      }
    } catch {
      // Invalid frames never become visible output.
    }
  }
  return remainder;
}

/**
 * Calls the literacy gateway (docs/api/learn.openapi.yaml). The body is the closed schema of
 * INV-EGR-04: question, locale and recent turns; the server picks the lessons. Nothing from the
 * vault is ever added here.
 */
export async function streamLearnMessage(
  input: { question: string; locale: LiteracyLocale; history: TutorTurn[]; signal?: AbortSignal },
  handlers: TutorStreamHandlers,
): Promise<void> {
  const response = await fetch("/api/learn/messages", {
    method: "POST",
    ...(input.signal == null ? {} : { signal: input.signal }),
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({
      question: input.question,
      locale: input.locale,
      history: input.history.slice(-MAX_HISTORY_TURNS).map(({ role, text }) => ({ role, text })),
    }),
  });
  // A static host answers unknown paths with 200 and an HTML page; only an event stream is an answer.
  const isStream = (response.headers.get("content-type") ?? "").includes("text/event-stream");
  if (!response.ok || response.body == null || !isStream) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("tutor-unavailable");
  }

  let received = false;
  const counting: TutorStreamHandlers = {
    ...handlers,
    onText: (text) => {
      received = true;
      handlers.onText(text);
    },
  };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffer = consumeFrames(buffer + decoder.decode(result.value, { stream: true }), counting);
  }
  consumeFrames(`${buffer}${decoder.decode()}\n\n`, counting);
  if (!received) throw new Error("tutor-empty");
}
