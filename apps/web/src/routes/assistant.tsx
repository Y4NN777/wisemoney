import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";
import Assistant from "../ui/Assistant/index.tsx";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assistant",
  component: Assistant,
});
