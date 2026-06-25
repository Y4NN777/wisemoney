import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Settings from "../ui/Settings/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: Settings,
});
