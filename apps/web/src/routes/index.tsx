import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Dashboard from "../ui/Dashboard/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});
