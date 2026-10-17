import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";

// Unlinked measuring page for Web Push delivery on real phones (ADR-0016 step 1).
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lab/push",
  component: lazyRouteComponent(() => import("../push/lab/PushLabPage.tsx")),
});
