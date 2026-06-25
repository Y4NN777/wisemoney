import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Capture from "../ui/Capture/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/capture",
  component: Capture,
});
