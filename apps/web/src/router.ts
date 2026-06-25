import { createRouter } from "@tanstack/react-router";
import { Route as rootRoute } from "./routes/__root.tsx";
import { Route as indexRoute } from "./routes/index.tsx";
import { Route as captureRoute } from "./routes/capture.tsx";
import { Route as assistantRoute } from "./routes/assistant.tsx";
import { Route as planningRoute } from "./routes/planning.tsx";
import { Route as settingsRoute } from "./routes/settings.tsx";
import { Route as budgetsRoute } from "./routes/budgets.tsx";
import { Route as goalsRoute } from "./routes/goals.tsx";
import { Route as recurringRoute } from "./routes/recurring.tsx";

const routeTree = rootRoute.addChildren([
  indexRoute,
  captureRoute,
  assistantRoute,
  planningRoute,
  settingsRoute,
  budgetsRoute,
  goalsRoute,
  recurringRoute,
]);

export const router = createRouter({ routeTree });
