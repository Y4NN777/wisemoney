import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as vaultLayoutRoute } from "./_vault.tsx";

export const Route = createRoute({
  getParentRoute: () => vaultLayoutRoute,
  path: "/budgets",
  component: lazyRouteComponent(() => import("../ui/Budgets/index.tsx")),
});
