import { createRoute, redirect } from "@tanstack/react-router";
import { Route as vaultLayoutRoute } from "./_vault.tsx";

export const captureTabs = ["transaction", "transfer", "goal", "manage"] as const;
export type CaptureTab = typeof captureTabs[number];
export const manageSections = ["accounts", "categories"] as const;
export type ManageSection = typeof manageSections[number];
export type TransactionDirection = "income" | "expense";

function isCaptureTab(value: unknown): value is CaptureTab {
  return typeof value === "string" && captureTabs.some((tab) => tab === value);
}

function isManageSection(value: unknown): value is ManageSection {
  return typeof value === "string" && manageSections.some((section) => section === value);
}

export function parseCaptureSearch(search: Record<string, unknown>): { tab?: CaptureTab; section?: ManageSection; direction?: TransactionDirection } {
  if (!isCaptureTab(search.tab)) return {};
  if (search.tab === "manage" && isManageSection(search.section)) {
    return { tab: "manage", section: search.section };
  }
  if (search.tab === "transaction" && (search.direction === "income" || search.direction === "expense")) {
    return { tab: "transaction", direction: search.direction };
  }
  return { tab: search.tab };
}

/**
 * Legacy deep links: capture moved into the overlay sheet over the current
 * screen, and account/category management moved to Settings. The route exists
 * only to redirect old URLs.
 */
export const Route = createRoute({
  getParentRoute: () => vaultLayoutRoute,
  path: "/capture",
  validateSearch: parseCaptureSearch,
  beforeLoad: ({ search }) => {
    const parsed = parseCaptureSearch(search);
    if (parsed.tab === "manage") {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack redirect contract
      throw redirect({ to: "/settings", replace: true });
    }
    const sheetSearch: Record<string, unknown> = { capture: parsed.tab ?? "transaction" };
    if (parsed.direction != null) sheetSearch.direction = parsed.direction;
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack redirect contract
    throw redirect({ to: "/", search: sheetSearch, replace: true });
  },
});
