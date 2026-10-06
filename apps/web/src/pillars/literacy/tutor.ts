import {
  LocalAdmissionError,
  beginLocalTicket,
  cancelLocalTicket,
  finishLocalTicket,
  getLocalTicket,
  requestLocalTicket,
  waitForLocalAdmissionChange,
} from "@/help/localAdmission.ts";
import { streamLearnMessage, type LiteracyLocale, type TutorLesson, type TutorSource, type TutorTurn } from "@/literacy/tutorClient.ts";

export type TutorAnswer = {
  unitIds: string[];
  /** The lessons the server grounded the answer in, closest first. */
  lessons: TutorLesson[];
  webSearch: boolean;
  sources: TutorSource[];
};

/** The tutor could not answer: no connection, the service failed, or the daily allowance is used. */
export class TutorUnavailableError extends Error {
  constructor(readonly reason: "offline" | "unavailable" | "quota") {
    super(reason);
  }
}

const ADMISSION_POLL_MS = 1_250;

/**
 * FR-LRN-08/09 (amended 2026-10-06): every question goes to the managed tutor, which retrieves the
 * lessons on the server. The phone carries no lessons, so offline or on a gateway failure nothing is
 * printed and the caller says why. The device-local help allowance is shared with WiseBot. No vault
 * data is read here (INV-EGR-04).
 */
export async function askTutor(
  input: { question: string; locale: LiteracyLocale; history: TutorTurn[]; online: boolean; signal?: AbortSignal },
  handlers: { onText: (text: string) => void },
): Promise<TutorAnswer> {
  if (!input.online) throw new TutorUnavailableError("offline");

  let ticketId: string | null = null;
  let streamed = false;
  const answer: TutorAnswer = { unitIds: [], lessons: [], webSearch: false, sources: [] };
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
    await streamLearnMessage({ question: input.question, locale: input.locale, history: input.history, ...(input.signal == null ? {} : { signal: input.signal }) }, {
      onText: (text) => {
        streamed = true;
        handlers.onText(text);
      },
      onMeta: (meta) => {
        answer.unitIds = meta.unitIds;
        answer.lessons = meta.lessons;
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
    // A partial stream is kept as it is: what was read stays readable.
    if (streamed) return answer;
    throw new TutorUnavailableError("unavailable");
  }
}
