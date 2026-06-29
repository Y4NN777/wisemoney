import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Debts from "../ui/Debts/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debts",
  component: Debts,
});
