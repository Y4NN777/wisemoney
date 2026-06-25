import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Planning from "../ui/Planning/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/planning",
  component: Planning,
});
