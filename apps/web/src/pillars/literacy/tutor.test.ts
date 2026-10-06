import { beforeEach, describe, expect, it, vi } from "vitest";

const admission = vi.hoisted(() => ({
  requestLocalTicket: vi.fn(),
  getLocalTicket: vi.fn(),
  beginLocalTicket: vi.fn(),
  finishLocalTicket: vi.fn(),
  cancelLocalTicket: vi.fn(),
  waitForLocalAdmissionChange: vi.fn(),
}));
type StreamInput = { question: string; locale: string; history: unknown[] };
type StreamHandlers = {
  onText: (text: string) => void;
  onMeta: (meta: { unitIds: string[]; webSearch: boolean; lessons: Array<{ id: string; title: string; publishers: string[] }> }) => void;
  onSources: (sources: Array<{ title: string; uri: string }>) => void;
};
const stream = vi.hoisted(() => ({ streamLearnMessage: vi.fn<(input: StreamInput, handlers: StreamHandlers) => Promise<void>>() }));

vi.mock("@/help/localAdmission.ts", () => ({
  ...admission,
  LocalAdmissionError: class LocalAdmissionError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
}));
vi.mock("@/literacy/tutorClient.ts", () => stream);

import { LocalAdmissionError } from "@/help/localAdmission.ts";
import { TutorUnavailableError, askTutor } from "./tutor.ts";

const ticket = { id: "t1", status: "admitted", position: 0, estimatedWaitSeconds: 0, remainingUnits: 19, resetAt: "" };

beforeEach(() => {
  vi.clearAllMocks();
  admission.requestLocalTicket.mockResolvedValue(ticket);
  admission.beginLocalTicket.mockResolvedValue(ticket);
  admission.finishLocalTicket.mockResolvedValue(ticket);
  admission.cancelLocalTicket.mockResolvedValue(ticket);
});

describe("askTutor", () => {
  it("streams from the gateway with only question, locale and turns, and keeps the lessons it names", async () => {
    const lessons = [{ id: "spot-a-scam", title: "Spot a scam before you pay", publishers: ["AMF-UMOA"] }];
    stream.streamLearnMessage.mockImplementation((_input, handlers) => {
      handlers.onMeta({ unitIds: ["spot-a-scam"], webSearch: true, lessons });
      handlers.onText("Players lose.");
      handlers.onSources([{ title: "example.org", uri: "https://example.org" }]);
      return Promise.resolve();
    });
    const chunks: string[] = [];

    const answer = await askTutor({ question: "Is sports betting an income?", locale: "en", history: [], online: true }, { onText: (text) => chunks.push(text) });

    expect(answer).toEqual({ unitIds: ["spot-a-scam"], lessons, webSearch: true, sources: [{ title: "example.org", uri: "https://example.org" }] });
    expect(chunks).toEqual(["Players lose."]);
    expect(Object.keys(stream.streamLearnMessage.mock.calls[0]![0]).sort()).toEqual(["history", "locale", "question"]);
    expect(admission.finishLocalTicket).toHaveBeenCalledWith("t1", true);
  });

  it("prints nothing of its own offline or when the gateway fails: the phone carries no lessons", async () => {
    const chunks: string[] = [];
    await expect(askTutor({ question: "comment marchent les intérêts composés", locale: "fr", history: [], online: false }, { onText: (text) => chunks.push(text) }))
      .rejects.toMatchObject({ reason: "offline" });
    expect(stream.streamLearnMessage).not.toHaveBeenCalled();
    expect(admission.requestLocalTicket).not.toHaveBeenCalled();

    stream.streamLearnMessage.mockRejectedValue(new Error("tutor-unavailable"));
    await expect(askTutor({ question: "explain", locale: "en", history: [], online: true }, { onText: (text) => chunks.push(text) }))
      .rejects.toMatchObject({ reason: "unavailable" });
    expect(chunks).toEqual([]);
    expect(admission.finishLocalTicket).toHaveBeenCalledWith("t1", false);
  });

  it("keeps a partial answer when the stream breaks", async () => {
    stream.streamLearnMessage.mockImplementation((_input, handlers) => {
      handlers.onText("Partial");
      return Promise.reject(new Error("network"));
    });
    const chunks: string[] = [];
    const answer = await askTutor({ question: "how to budget", locale: "en", history: [], online: true }, { onText: (text) => chunks.push(text) });
    expect(answer.lessons).toEqual([]);
    expect(chunks).toEqual(["Partial"]);
  });

  it("reports why nothing can answer: offline, unavailable, or allowance used", async () => {
    await expect(askTutor({ question: "zzzz qqqq", locale: "en", history: [], online: false }, { onText: () => undefined }))
      .rejects.toMatchObject({ reason: "offline" });
    stream.streamLearnMessage.mockRejectedValue(new Error("tutor-unavailable"));
    await expect(askTutor({ question: "zzzz qqqq", locale: "en", history: [], online: true }, { onText: () => undefined }))
      .rejects.toBeInstanceOf(TutorUnavailableError);
    admission.requestLocalTicket.mockRejectedValue(new LocalAdmissionError("quota"));
    await expect(askTutor({ question: "how to budget", locale: "en", history: [], online: true }, { onText: () => undefined }))
      .rejects.toMatchObject({ reason: "quota" });
  });
});
