import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";

export const captureTabs = ["transaction", "transfer", "goal", "manage"] as const;
export type CaptureTab = typeof captureTabs[number];

function isCaptureTab(value: unknown): value is CaptureTab {
  return typeof value === "string" && captureTabs.some((tab) => tab === value);
}

export function parseCaptureSearch(search: Record<string, unknown>): { tab?: CaptureTab } {
  return isCaptureTab(search.tab) ? { tab: search.tab } : {};
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/capture",
  validateSearch: parseCaptureSearch,
  component: lazyRouteComponent(() => import("../ui/Capture/index.tsx")),
});
