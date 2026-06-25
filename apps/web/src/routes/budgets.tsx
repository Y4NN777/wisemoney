import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Budgets from "../ui/Budgets/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/budgets",
  component: Budgets,
});
