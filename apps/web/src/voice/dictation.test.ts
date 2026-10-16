import { describe, expect, it } from "vitest";
import { appendDictated, canRunLocally, failureFor, finalTranscript, findRecognition, speechLang, type RecognitionCtor } from "./dictation.ts";

describe("dictation", () => {
  it("finds the standard or the prefixed API, and nothing otherwise", () => {
    class Fake {}
    expect(findRecognition({ webkitSpeechRecognition: Fake })).toBe(Fake);
    expect(findRecognition({ SpeechRecognition: Fake })).toBe(Fake);
    expect(findRecognition({})).toBeNull();
  });

  it("asks for French or English speech from the app language", () => {
    expect(speechLang("fr-BF")).toBe("fr-FR");
    expect(speechLang("en")).toBe("en-US");
  });

  it("runs on the device only when the browser says the language is available", async () => {
    const ctor = (answer: string | Error) => Object.assign(class {}, { available: () => answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer) }) as unknown as RecognitionCtor;
    expect(await canRunLocally(ctor("available"), "fr-FR")).toBe(true);
    expect(await canRunLocally(ctor("downloadable"), "fr-FR")).toBe(false);
    expect(await canRunLocally(ctor(new Error("x")), "fr-FR")).toBe(false);
    expect(await canRunLocally(class {} as unknown as RecognitionCtor, "fr-FR")).toBe(false);
  });

  it("keeps only finished words", () => {
    const result = (text: string, isFinal: boolean) => Object.assign([{ transcript: text }], { isFinal });
    expect(finalTranscript({ resultIndex: 0, results: [result("taxi ", true), result("deux", false)] })).toBe("taxi");
  });

  it("reports a refused microphone or a lost network, and stays quiet on silence", () => {
    expect(failureFor("not-allowed")).toBe("denied");
    expect(failureFor("network")).toBe("offline");
    expect(failureFor("no-speech")).toBeNull();
    expect(failureFor("aborted")).toBeNull();
    expect(failureFor("audio-capture")).toBe("failed");
  });

  it("adds dictated words after the typed text", () => {
    expect(appendDictated("", "comment épargner")).toBe("comment épargner");
    expect(appendDictated("Crédit : ", "taux maximum")).toBe("Crédit : taux maximum");
  });
});
