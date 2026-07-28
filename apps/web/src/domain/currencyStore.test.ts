import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettingRecord } from "@/db/schema.ts";
import type { MasterKey } from "@/crypto/envelope.ts";

const { settings } = vi.hoisted(() => {
  let record: AppSettingRecord | undefined;
  return {
    settings: {
      get: (_id: string) => Promise.resolve(record),
      put: (value: AppSettingRecord) => {
        record = value;
        return Promise.resolve(value.id);
      },
      clear: () => { record = undefined; },
      peek: () => record,
    },
  };
});

vi.mock("@/db/schema.ts", () => ({
  db: {
    appSettings: settings,
    fxRates: { toArray: () => Promise.resolve([]) },
  },
}));

import { loadCurrencyContext, setStoredBaseCurrency } from "./currencyStore.ts";

async function makeMasterKey(): Promise<MasterKey> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { _brand: "MasterKey", key };
}

beforeEach(() => {
  settings.clear();
  vi.unstubAllGlobals();
});

describe("encrypted base currency", () => {
  it("round-trips through the encrypted app-settings store", async () => {
    const masterKey = await makeMasterKey();
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => null, removeItem });

    await setStoredBaseCurrency("EUR", masterKey);

    const record = settings.peek();
    expect(record?.id).toBe("baseCurrency");
    expect(new TextDecoder().decode(record?.ciphertext)).not.toContain("EUR");
    await expect(loadCurrencyContext(masterKey)).resolves.toMatchObject({ baseCurrency: "EUR" });
    expect(removeItem).toHaveBeenCalledWith("wisemoney_default_currency");
  });

  it("migrates and removes the legacy localStorage value", async () => {
    const masterKey = await makeMasterKey();
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => key === "wisemoney_default_currency" ? "XOF" : null,
      removeItem,
    });

    await expect(loadCurrencyContext(masterKey)).resolves.toMatchObject({ baseCurrency: "XOF" });
    expect(settings.peek()).toBeDefined();
    expect(removeItem).toHaveBeenCalledWith("wisemoney_default_currency");
  });
});
