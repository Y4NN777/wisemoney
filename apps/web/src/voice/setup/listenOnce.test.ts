import { describe, expect, it, vi } from "vitest";
import type { RecognitionCtor, RecognitionLike } from "../dictation.ts";
import { ListenFailure, listenOnce } from "./listenOnce.ts";

function fakeRecognition() {
  const sessions: RecognitionLike[] = [];
  class Fake {
    lang = ""; interimResults = true; continuous = true; processLocally = false;
    onresult = null; onerror = null; onend = null; onaudiostart = null; onspeechend = null;
    start = vi.fn(); stop = vi.fn(); abort = vi.fn(() => (this as unknown as RecognitionLike).onend?.());
    constructor() { sessions.push(this); }
  }
  return { ctor: Fake as unknown as RecognitionCtor, sessions };
}
const final = (text: string) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });

describe("listenOnce", () => {
  it("listens on the device only and times end of speech to text", async () => {
    const { ctor, sessions } = fakeRecognition();
    let clock = 1_000;
    const { heard } = listenOnce(ctor, "fr-FR", () => clock);
    const session = sessions[0]!;
    expect(session.processLocally).toBe(true);
    expect(session.lang).toBe("fr-FR");
    session.onaudiostart?.();
    session.onspeechend?.();
    clock = 2_400;
    session.onresult?.(final("Loyer quatre-vingt-dix mille"));
    session.onend?.();
    expect(await heard).toEqual({ text: "Loyer quatre-vingt-dix mille", ms: 1_400 });
  });

  it("gives no time when the browser never reports the end of speech", async () => {
    const { ctor, sessions } = fakeRecognition();
    const { heard } = listenOnce(ctor, "fr-FR");
    sessions[0]!.onresult?.(final("Loyer"));
    sessions[0]!.onend?.();
    expect(await heard).toEqual({ text: "Loyer", ms: null });
  });

  it("reports a refused microphone, and nothing for silence", async () => {
    const { ctor, sessions } = fakeRecognition();
    const refused = listenOnce(ctor, "fr-FR");
    sessions[0]!.onerror?.({ error: "not-allowed" });
    sessions[0]!.onend?.();
    await expect(refused.heard).rejects.toEqual(new ListenFailure("denied"));
    const quiet = listenOnce(ctor, "fr-FR");
    sessions[1]!.onerror?.({ error: "no-speech" });
    sessions[1]!.onend?.();
    expect(await quiet.heard).toEqual({ text: "", ms: null });
  });

  it("stops a browser that never captures audio", async () => {
    vi.useFakeTimers();
    const { ctor } = fakeRecognition();
    const { heard } = listenOnce(ctor, "fr-FR");
    const settled = expect(heard).rejects.toEqual(new ListenFailure("silent"));
    vi.advanceTimersByTime(5_000);
    await settled;
    vi.useRealTimers();
  });
});
