import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Recurring from "../ui/Recurring/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recurring",
  component: Recurring,
});
