import { describe, expect, it } from "vitest";
import { appendDictated, canRunLocally, failureFor, finalTranscript, findRecognition, isIosHomeScreenApp, speechLang, type RecognitionCtor } from "./dictation.ts";

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

  it("does not offer dictation in an iPhone or iPad home-screen app, where it never transcribes", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15";
    const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    const android = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36";
    expect(isIosHomeScreenApp({ userAgent: iphone, maxTouchPoints: 5, standalone: true, displayStandalone: true })).toBe(true);
    expect(isIosHomeScreenApp({ userAgent: ipad, maxTouchPoints: 5, displayStandalone: true })).toBe(true);
    expect(isIosHomeScreenApp({ userAgent: iphone, maxTouchPoints: 5, standalone: false, displayStandalone: false })).toBe(false);
    expect(isIosHomeScreenApp({ userAgent: android, maxTouchPoints: 5, displayStandalone: true })).toBe(false);
    expect(isIosHomeScreenApp({ userAgent: ipad, maxTouchPoints: 0, displayStandalone: true })).toBe(false);
  });
});
