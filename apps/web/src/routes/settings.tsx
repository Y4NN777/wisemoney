import { createRoute } from "@tanstack/react-router";
import { vaultPage } from "./vaultPage.ts";
import { Route as vaultLayoutRoute } from "./_vault.tsx";

export const SETTINGS_PANELS = ["accounts", "categories", "money", "reminders", "security", "data", "tips", "assistant", "about"] as const;
export type SettingsPanelId = typeof SETTINGS_PANELS[number];
export type SettingsSearch = { panel?: SettingsPanelId };

/**
 * `?panel=<id>` opens one section of Settings on its own screen. `accounts` and `categories` are the
 * two tabs of "Accounts & categories" (deep links from Home, the capture sheet and help).
 */
export function parseSettingsSearch(search: Record<string, unknown>): SettingsSearch {
  const panel = SETTINGS_PANELS.find((candidate) => candidate === search.panel);
  return panel == null ? {} : { panel };
}

export const Route = createRoute({
  getParentRoute: () => vaultLayoutRoute,
  path: "/settings",
  validateSearch: parseSettingsSearch,
  component: vaultPage(() => import("../ui/Settings/index.tsx")),
});
