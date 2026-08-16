import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";

export const captureTabs = ["transaction", "transfer", "goal", "manage"] as const;
export type CaptureTab = typeof captureTabs[number];
export const manageSections = ["accounts", "categories"] as const;
export type ManageSection = typeof manageSections[number];

function isCaptureTab(value: unknown): value is CaptureTab {
  return typeof value === "string" && captureTabs.some((tab) => tab === value);
}

function isManageSection(value: unknown): value is ManageSection {
  return typeof value === "string" && manageSections.some((section) => section === value);
}

export function parseCaptureSearch(search: Record<string, unknown>): { tab?: CaptureTab; section?: ManageSection } {
  if (!isCaptureTab(search.tab)) return {};
  if (search.tab === "manage" && isManageSection(search.section)) {
    return { tab: "manage", section: search.section };
  }
  return { tab: search.tab };
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/capture",
  validateSearch: parseCaptureSearch,
  component: lazyRouteComponent(() => import("../ui/Capture/index.tsx")),
});
