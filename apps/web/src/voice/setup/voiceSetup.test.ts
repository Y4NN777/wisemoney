import { describe, expect, it } from "vitest";
import { chooseVoiceEngine, packPreflight, PACK_BYTES_NEEDED, phrasePassed, scoreEngine, setupLanguage, TEST_PHRASES, type EngineScore, type VoiceProbe } from "./voiceSetup.ts";
import { browserSignature, needsRetest, parseVoiceProfile, type VoiceProfile } from "./voiceProfile.ts";

const score = (passed: number, medianMs: number | null = 1_200): EngineScore => ({ passed, total: 5, medianMs });
const probe = (device: boolean, pack: VoiceProbe["pack"] = null): VoiceProbe => ({ device, pack });

describe("voice set-up phrases", () => {
  it("every phrase passes when heard exactly, in both languages", () => {
    for (const phrase of TEST_PHRASES) {
      expect(phrasePassed(phrase, "fr", phrase.said.fr)).toBe(true);
      expect(phrasePassed(phrase, "en", phrase.said.en)).toBe(true);
    }
  });

  it("passes on digits, other case and a final full stop", () => {
    const [fuel, , , salary] = TEST_PHRASES;
    expect(phrasePassed(fuel!, "fr", "essence moto 2500.")).toBe(true);
    expect(phrasePassed(salary!, "fr", "SALAIRE 175 000")).toBe(true);
  });

  it("fails on a wrong amount, a lost direction or a missing word", () => {
    const [fuel, , rent, , refund] = TEST_PHRASES;
    expect(phrasePassed(fuel!, "fr", "Essence moto deux mille sans")).toBe(false);
    expect(phrasePassed(rent!, "fr", "Loyer quatre vingt mille")).toBe(false);
    expect(phrasePassed(refund!, "fr", "Awa douze mille cinq cents")).toBe(false);
    expect(phrasePassed(refund!, "fr", "Ah va m'a remboursé douze mille cinq cents")).toBe(false);
    expect(phrasePassed(fuel!, "fr", "")).toBe(false);
  });

  it("picks the test language from the app language", () => {
    expect(setupLanguage("fr-BF")).toBe("fr");
    expect(setupLanguage("en")).toBe("en");
  });

  it("scores passes and the median time", () => {
    expect(scoreEngine([{ id: "a", passed: true, ms: 900 }, { id: "b", passed: false, ms: 3_000 }, { id: "c", passed: true, ms: 1_500 }])).toEqual({ passed: 2, total: 3, medianMs: 1_500 });
    expect(scoreEngine([{ id: "a", passed: true, ms: 1_000 }, { id: "b", passed: true, ms: 2_000 }]).medianMs).toBe(1_500);
    expect(scoreEngine([{ id: "a", passed: true, ms: null }]).medianMs).toBeNull();
  });
});

describe("voice engine decision", () => {
  it("tests the phone's own recognition first, and keeps it when it qualifies", () => {
    expect(chooseVoiceEngine(probe(true), {})).toEqual({ kind: "test", engine: "device" });
    expect(chooseVoiceEngine(probe(true), { device: score(4) })).toEqual({ kind: "use", engine: "device", reason: "qualified" });
  });

  it("does not keep a recognition that is right but slow", () => {
    expect(chooseVoiceEngine(probe(true), { device: score(5, 3_500) })).toEqual({ kind: "test", engine: "keyboard" });
  });

  it("goes to the keyboard when there is no on-device recognition or it fails", () => {
    expect(chooseVoiceEngine(probe(false), {})).toEqual({ kind: "test", engine: "keyboard" });
    expect(chooseVoiceEngine(probe(true), { device: score(3) })).toEqual({ kind: "test", engine: "keyboard" });
    expect(chooseVoiceEngine(probe(false), { keyboard: score(4, null) })).toEqual({ kind: "use", engine: "keyboard", reason: "qualified" });
  });

  it("offers the pack only after the keyboard failed or was skipped", () => {
    expect(chooseVoiceEngine(probe(false), { keyboard: score(2, null) })).toEqual({ kind: "offerPack" });
    expect(chooseVoiceEngine(probe(false), { keyboard: "skipped" })).toEqual({ kind: "offerPack" });
  });

  it("uses the pack when it qualifies", () => {
    expect(chooseVoiceEngine(probe(false), { keyboard: score(2, null), pack: score(5, 2_000) })).toEqual({ kind: "use", engine: "pack", reason: "qualified" });
  });

  it("falls back to a partly good keyboard, or to typing, when the pack does no better", () => {
    expect(chooseVoiceEngine(probe(false), { keyboard: score(3, null), pack: score(3) })).toEqual({ kind: "use", engine: "keyboard", reason: "packNoBetter" });
    expect(chooseVoiceEngine(probe(false), { keyboard: score(1, null), pack: score(2) })).toEqual({ kind: "typing", reason: "packNoBetter" });
    expect(chooseVoiceEngine(probe(false), { keyboard: "skipped", pack: score(5, 4_000) })).toEqual({ kind: "typing", reason: "packNoBetter" });
  });

  it("never offers a pack the phone cannot hold or run", () => {
    expect(chooseVoiceEngine(probe(false, "storage"), { keyboard: score(3, null) })).toEqual({ kind: "use", engine: "keyboard", reason: "packUnavailable" });
    expect(chooseVoiceEngine(probe(false, "unsupported"), { keyboard: "skipped" })).toEqual({ kind: "typing", reason: "packUnavailable" });
  });

  it("respects a declined pack", () => {
    expect(chooseVoiceEngine(probe(false), { keyboard: score(3, null), pack: "skipped" })).toEqual({ kind: "use", engine: "keyboard", reason: "packDeclined" });
    expect(chooseVoiceEngine(probe(false), { keyboard: "skipped", pack: "skipped" })).toEqual({ kind: "typing", reason: "packDeclined" });
  });
});

describe("voice pack preflight", () => {
  const env = { wasm: true, microphone: true, freeBytes: PACK_BYTES_NEEDED, saveData: false, cellular: false, deviceMemoryGb: 4 };

  it("allows the pack with room, a microphone and WebAssembly", () => {
    expect(packPreflight(env)).toEqual({ blocked: null, askWifi: false, slowWarning: false });
    expect(packPreflight({ ...env, freeBytes: null, deviceMemoryGb: null }).blocked).toBeNull();
  });

  it("blocks it without room or support, asks about Wi-Fi on mobile data, warns on low memory", () => {
    expect(packPreflight({ ...env, freeBytes: PACK_BYTES_NEEDED - 1 }).blocked).toBe("storage");
    expect(packPreflight({ ...env, wasm: false }).blocked).toBe("unsupported");
    expect(packPreflight({ ...env, microphone: false }).blocked).toBe("unsupported");
    expect(packPreflight({ ...env, cellular: true }).askWifi).toBe(true);
    expect(packPreflight({ ...env, saveData: true }).askWifi).toBe(true);
    expect(packPreflight({ ...env, deviceMemoryGb: 1 }).slowWarning).toBe(true);
  });
});

describe("voice profile", () => {
  const profile: VoiceProfile = {
    engine: "pack",
    results: { keyboard: [{ id: "fuel", passed: false, ms: null }], pack: [{ id: "fuel", passed: true, ms: 1_800 }] },
    testedAt: "2026-10-17T08:00:00.000Z",
    appVersion: "1.0.0",
    browser: "Chrome/141",
    modelRevision: "abc123",
  };

  it("reads back what it wrote and refuses anything else", () => {
    expect(parseVoiceProfile(JSON.stringify(profile))).toEqual(profile);
    expect(parseVoiceProfile(JSON.stringify({ ...profile, engine: null, modelRevision: null }))?.engine).toBeNull();
    expect(parseVoiceProfile(null)).toBeNull();
    expect(parseVoiceProfile("{not json")).toBeNull();
    expect(parseVoiceProfile(JSON.stringify({ ...profile, engine: "cloud" }))).toBeNull();
    expect(parseVoiceProfile(JSON.stringify({ ...profile, results: { cloud: [] } }))).toBeNull();
    expect(parseVoiceProfile(JSON.stringify({ ...profile, results: { pack: [{ id: "fuel", passed: "yes", ms: 1 }] } }))).toBeNull();
  });

  it("names the browser and its major version", () => {
    expect(browserSignature("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")).toBe("Chrome/141");
    expect(browserSignature("Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36")).toBe("SamsungBrowser/28");
    expect(browserSignature("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1")).toBe("Safari/26");
    expect(browserSignature("curl/8")).toBe("unknown");
  });

  it("asks for a new test when the browser or the pinned pack changes", () => {
    expect(needsRetest(null, { browser: "Chrome/141", modelRevision: "abc123" })).toBe(true);
    expect(needsRetest(profile, { browser: "Chrome/141", modelRevision: "abc123" })).toBe(false);
    expect(needsRetest(profile, { browser: "Chrome/142", modelRevision: "abc123" })).toBe(true);
    expect(needsRetest(profile, { browser: "Chrome/141", modelRevision: "def456" })).toBe(true);
    expect(needsRetest({ ...profile, engine: "keyboard" }, { browser: "Chrome/141", modelRevision: "def456" })).toBe(false);
  });
});
