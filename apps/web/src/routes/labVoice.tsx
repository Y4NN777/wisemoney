import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root.tsx";

// Unlinked measuring page for the offline voice pack decision (ADR-0014 follow-up).
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lab/voice",
  component: lazyRouteComponent(() => import("../voice/lab/VoiceLabPage.tsx")),
});
