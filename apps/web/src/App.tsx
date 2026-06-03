/**
 * App root — TanStack Router outlet + three primary surfaces.
 *
 * Route structure:
 *   /           → Dashboard (Financial State snapshot)
 *   /capture    → Capture (fast event entry, offline-first)
 *   /assistant  → Assistant (AI guidance + learning)
 *
 * Mobile-first layout: bottom navigation bar with three tabs.
 *
 * NFR-MOD-01: app shell imports state pillar; AI pillar is loaded lazily only
 * when the Assistant surface is mounted.
 * NFR-MOD-02: no provider SDK imports anywhere in this file or its direct deps.
 * NFR-MOD-03: no direct localStorage consent access here.
 *
 * TODO (T-S0-04+):
 * - Replace placeholder routing with TanStack Router createRouter + RouterProvider.
 * - Add lazy() boundaries for Intelligence + Literacy (NFR-MOD-01 isolation).
 * - Add a KeyUnlock gate: require masterKey in session before rendering surfaces
 *   (INV-PERS-02 — user must unlock the encrypted store before any financial data
 *   is accessible).
 * - WCAG 2.2 AA: implement focus management on route change; skip-nav link.
 */

import { Suspense, lazy } from "react";

const Dashboard = lazy(() => import("./ui/Dashboard/index.tsx"));
const Capture = lazy(() => import("./ui/Capture/index.tsx"));
const Assistant = lazy(() => import("./ui/Assistant/index.tsx"));

// Minimal placeholder router until TanStack Router is wired (T-S0-04).
function usePath(): string {
  return window.location.pathname;
}

export default function App() {
  const path = usePath();

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      {/* TODO: replace with TanStack Router <Outlet /> */}
      <Suspense fallback={<div aria-live="polite">Loading…</div>}>
        {path === "/capture" ? (
          <Capture />
        ) : path === "/assistant" ? (
          <Assistant />
        ) : (
          <Dashboard />
        )}
      </Suspense>

      {/* Bottom navigation — mobile-first. TODO: wire to TanStack Router <Link>. */}
      <nav aria-label="Primary navigation" style={{ marginTop: "auto" }}>
        <a href="/">Dashboard</a>
        <a href="/capture">Capture</a>
        <a href="/assistant">Assistant</a>
      </nav>
    </div>
  );
}
