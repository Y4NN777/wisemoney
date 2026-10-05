import { createRoute } from "@tanstack/react-router";
import { vaultPage } from "./vaultPage.ts";
import { Route as vaultLayoutRoute } from "./_vault.tsx";

export type SettingsPanelId = "accounts" | "categories";
export type SettingsSearch = { panel?: SettingsPanelId };

/** `?panel=accounts|categories` opens the "Accounts & categories" panel on that tab (deep links from Home, the capture sheet and help). */
export function parseSettingsSearch(search: Record<string, unknown>): SettingsSearch {
  const panel = search.panel;
  return panel === "accounts" || panel === "categories" ? { panel } : {};
}

export const Route = createRoute({
  getParentRoute: () => vaultLayoutRoute,
  path: "/settings",
  validateSearch: parseSettingsSearch,
  component: vaultPage(() => import("../ui/Settings/index.tsx")),
});
