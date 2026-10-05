import { createRoute } from "@tanstack/react-router";
import { vaultPage } from "./vaultPage.ts";
import { Route as vaultLayoutRoute } from "./_vault.tsx";

export const Route = createRoute({
  getParentRoute: () => vaultLayoutRoute,
  path: "/budgets",
  component: vaultPage(() => import("../ui/Budgets/index.tsx")),
});
