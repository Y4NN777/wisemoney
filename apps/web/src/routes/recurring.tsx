import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as vaultLayoutRoute } from "./_vault.tsx";

export const Route = createRoute({
  getParentRoute: () => vaultLayoutRoute,
  path: "/recurring",
  component: lazyRouteComponent(() => import("../ui/Recurring/index.tsx")),
});
