import { createRoute } from "@tanstack/react-router";
import { vaultPage } from "./vaultPage.ts";
import { Route as vaultLayoutRoute } from "./_vault.tsx";

export type LearnSearch = { unit?: string };

const UNIT_ID = /^[a-z0-9-]{1,80}$/;

/** `?unit=<lesson id>` opens that lesson (links from Plan); anything that is not a lesson id is dropped. */
export function parseLearnSearch(search: Record<string, unknown>): LearnSearch {
  return typeof search.unit === "string" && UNIT_ID.test(search.unit) ? { unit: search.unit } : {};
}

export const Route = createRoute({
  getParentRoute: () => vaultLayoutRoute,
  path: "/learn",
  validateSearch: parseLearnSearch,
  component: vaultPage(() => import("../ui/Learn/index.tsx")),
});
