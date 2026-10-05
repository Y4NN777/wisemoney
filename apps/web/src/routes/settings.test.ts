import { describe, expect, it, vi } from "vitest";
vi.mock("./_vault.tsx", () => ({ Route: {} }));
vi.mock("@tanstack/react-router", () => ({ createRoute: () => ({}) }));
import { SETTINGS_PANELS, parseSettingsSearch } from "./settings.tsx";

describe("settings search", () => {
  it("opens the list when no section is named", () => {
    expect(parseSettingsSearch({})).toEqual({});
  });

  it("keeps the two legacy deep links to accounts and categories", () => {
    expect(parseSettingsSearch({ panel: "accounts" })).toEqual({ panel: "accounts" });
    expect(parseSettingsSearch({ panel: "categories" })).toEqual({ panel: "categories" });
  });

  it("accepts every section and nothing else", () => {
    for (const panel of SETTINGS_PANELS) expect(parseSettingsSearch({ panel })).toEqual({ panel });
    expect(parseSettingsSearch({ panel: "unknown" })).toEqual({});
    expect(parseSettingsSearch({ panel: 3 })).toEqual({});
  });
});
