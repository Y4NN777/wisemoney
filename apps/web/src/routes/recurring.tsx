import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recurring",
  component: lazyRouteComponent(() => import("../ui/Recurring/index.tsx")),
});
