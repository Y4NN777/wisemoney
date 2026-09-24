import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissDeviceUnlockOffer, recordPassphraseUnlock, shouldOfferDeviceUnlock } from "./deviceUnlockOffer.ts";

const available = { webAuthnAvailable: true, hasDeviceUnlock: false };

describe("device unlock offer", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("waits for the second passphrase unlock", () => {
    expect(shouldOfferDeviceUnlock(available)).toBe(false);
    recordPassphraseUnlock();
    expect(shouldOfferDeviceUnlock(available)).toBe(false);
    recordPassphraseUnlock();
    expect(shouldOfferDeviceUnlock(available)).toBe(true);
  });

  it("stays away once dismissed", () => {
    recordPassphraseUnlock();
    recordPassphraseUnlock();
    dismissDeviceUnlockOffer();
    expect(shouldOfferDeviceUnlock(available)).toBe(false);
  });

  it("never offers without WebAuthn or when device unlock already exists", () => {
    recordPassphraseUnlock();
    recordPassphraseUnlock();
    expect(shouldOfferDeviceUnlock({ webAuthnAvailable: false, hasDeviceUnlock: false })).toBe(false);
    expect(shouldOfferDeviceUnlock({ webAuthnAvailable: true, hasDeviceUnlock: true })).toBe(false);
  });

  it("treats corrupt storage as a fresh state", () => {
    localStorage.setItem("wisemoney.deviceUnlockOffer.v1", "{not json");
    expect(shouldOfferDeviceUnlock(available)).toBe(false);
    recordPassphraseUnlock();
    recordPassphraseUnlock();
    expect(shouldOfferDeviceUnlock(available)).toBe(true);
  });
});
