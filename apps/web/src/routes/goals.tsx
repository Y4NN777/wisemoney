import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Goals from "../ui/Goals/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals",
  component: Goals,
});
