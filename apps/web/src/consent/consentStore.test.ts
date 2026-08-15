import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllConsent, getConsentLevel, grantHelpProviderConsent, hasHelpProviderConsent, revokeConsent, setConsentLevel } from "./consentStore.ts";

const values = new Map<string, string>();
const storage: Record<string, unknown> = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value);
    storage[key] = value;
  },
  removeItem: (key: string) => {
    values.delete(key);
    delete storage[key];
  },
};

beforeEach(() => {
  values.clear();
  for (const key of Object.keys(storage)) {
    if (!['getItem', 'setItem', 'removeItem'].includes(key)) delete storage[key];
  }
  vi.stubGlobal("localStorage", storage);
});

describe("consent store", () => {
  it("distinguishes a first use from an explicit redacted choice", () => {
    expect(getConsentLevel("literacy")).toBe("NotPrompted");
    setConsentLevel("literacy", "Redacted");
    expect(getConsentLevel("literacy")).toBe("Redacted");
  });

  it("fails closed for an unknown stored value", () => {
    values.set("wisemoney:consent:literacy", "corrupt");
    expect(getConsentLevel("literacy")).toBe("Redacted");
  });

  it("revokes full access and deletes legacy assertions", () => {
    setConsentLevel("literacy", "FullGranted");
    values.set("wisemoney:consent:literacy:assertion", "legacy");
    revokeConsent("literacy");
    expect(getConsentLevel("literacy")).toBe("Redacted");
    expect(values.has("wisemoney:consent:literacy:assertion")).toBe(false);
  });

  it("clears consent keys without touching unrelated local data", () => {
    localStorage.setItem("wisemoney:consent:literacy", "FullGranted");
    localStorage.setItem("unrelated", "keep");
    clearAllConsent();
    expect(values.get("unrelated")).toBe("keep");
    expect(getConsentLevel("literacy")).toBe("NotPrompted");
  });
});

describe("help provider consent", () => {
  it("requires the current version and stores no conversation content", () => {
    expect(hasHelpProviderConsent()).toBe(false);
    grantHelpProviderConsent();
    expect(hasHelpProviderConsent()).toBe(true);
    expect(localStorage.getItem("wisemoney.help.google-consent.v1")).not.toContain("question");
  });

  it("rejects old or corrupt records", () => {
    localStorage.setItem("wisemoney.help.google-consent.v1", '{"version":0,"accepted":true}');
    expect(hasHelpProviderConsent()).toBe(false);
    localStorage.setItem("wisemoney.help.google-consent.v1", "not-json");
    expect(hasHelpProviderConsent()).toBe(false);
  });
});
