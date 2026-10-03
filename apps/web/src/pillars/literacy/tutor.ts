import {
  LocalAdmissionError,
  beginLocalTicket,
  cancelLocalTicket,
  finishLocalTicket,
  getLocalTicket,
  requestLocalTicket,
  waitForLocalAdmissionChange,
} from "@/help/localAdmission.ts";
import { MAX_GROUNDING_UNITS, findRelevantUnits, getLiteracyUnits, unitAsMarkdown, type LiteracyLocale } from "@/literacy/corpus.ts";
import { streamLearnMessage, type TutorSource, type TutorStreamHandlers, type TutorTurn } from "@/literacy/tutorClient.ts";

/** "tutor": the managed Gemma gateway answered. "lesson": the on-device lesson answered. */
export type TutorPath = "tutor" | "lesson";

export type TutorAnswer = {
  path: TutorPath;
  unitIds: string[];
  webSearch: boolean;
  sources: TutorSource[];
};

/** No lesson covers the question and the tutor could not be reached. */
export class TutorUnavailableError extends Error {
  constructor(readonly reason: "offline" | "unavailable" | "quota") {
    super(reason);
  }
}

const ADMISSION_POLL_MS = 1_250;

/**
 * FR-LRN-08/09: general questions go to the managed tutor when the device is online; the reviewed
 * lesson answers on the device when it is offline or the gateway fails. The device-local help
 * allowance is shared with WiseBot. No vault data is read here (INV-EGR-04).
 */
export async function askTutor(
  input: { question: string; locale: LiteracyLocale; history: TutorTurn[]; unitIds?: string[]; online: boolean; signal?: AbortSignal },
  handlers: Pick<TutorStreamHandlers, "onText">,
): Promise<TutorAnswer> {
  const corpus = getLiteracyUnits(input.locale);
  const requested = (input.unitIds ?? []).flatMap((id) => corpus.find((unit) => unit.id === id) ?? []);
  const units = requested.length > 0 ? requested.slice(0, MAX_GROUNDING_UNITS) : findRelevantUnits(corpus, input.question);
  const unitIds = units.map(({ id }) => id);

  const answerFromLesson = (reason: "offline" | "unavailable"): TutorAnswer => {
    const lesson = units[0];
    if (lesson == null) throw new TutorUnavailableError(reason);
    handlers.onText(unitAsMarkdown(lesson));
    return { path: "lesson", unitIds: [lesson.id], webSearch: false, sources: [] };
  };

  if (!input.online) return answerFromLesson("offline");

  let ticketId: string | null = null;
  let streamed = false;
  const answer: TutorAnswer = { path: "tutor", unitIds, webSearch: false, sources: [] };
  try {
    let ticket = await requestLocalTicket(false);
    ticketId = ticket.id;
    while (ticket.status === "waiting") {
      await waitForLocalAdmissionChange(ADMISSION_POLL_MS);
      if (input.signal?.aborted === true) throw input.signal.reason;
      ticket = await getLocalTicket(ticket.id);
    }
    if (ticket.status !== "admitted") throw new Error("ticket-expired");
    await beginLocalTicket(ticket.id);
    await streamLearnMessage({ question: input.question, locale: input.locale, history: input.history, unitIds, ...(input.signal == null ? {} : { signal: input.signal }) }, {
      onText: (text) => {
        streamed = true;
        handlers.onText(text);
      },
      onMeta: (meta) => {
        answer.unitIds = meta.unitIds;
        answer.webSearch = meta.webSearch;
      },
      onSources: (sources) => {
        answer.sources = sources;
      },
    });
    await finishLocalTicket(ticket.id, true);
    return answer;
  } catch (error) {
    if (input.signal?.aborted === true) {
      if (ticketId != null) await cancelLocalTicket(ticketId).catch(() => undefined);
      throw error;
    }
    if (ticketId != null) await finishLocalTicket(ticketId, false).catch(() => undefined);
    if (error instanceof LocalAdmissionError && error.reason === "quota") throw new TutorUnavailableError("quota");
    // A partial stream is kept as it is; replacing it with the lesson would rewrite what was read.
    if (streamed) return answer;
    return answerFromLesson("unavailable");
  }
}
