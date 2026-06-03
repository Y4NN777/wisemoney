/**
 * Dashboard surface — Financial State snapshot view.
 *
 * ARCHITECTURE §2.1: reads from FinancialState Engine (cached snapshot fast path;
 * replay if stale). Fully offline-capable (INV-PERS-01).
 *
 * NFR-MOD-01: this surface imports NOTHING from the Intelligence or Literacy
 * pillars, and nothing from ai/. State failure and AI failure are independent.
 *
 * NFR-MOD-02: this surface does NOT import AIOrchestrClient.
 * NFR-MOD-03: this surface does NOT read/write localStorage consent directly.
 *
 * TODO (FR-UI-01): implement balance summary, category totals, budget progress,
 * goal progress, and FX-rate staleness indicator (ARCHITECTURE §5).
 * All amounts display in integer minor units converted to display strings at the
 * presentation layer only — no float arithmetic (INV-MON-01).
 */

export default function Dashboard() {
  // TODO: subscribe to FinancialState Engine snapshot via TanStack Query + Zustand
  return (
    <main aria-label="Dashboard">
      {/* TODO: implement balance card, category breakdown, budget progress, goal progress */}
      <p>Dashboard — not yet implemented</p>
    </main>
  );
}
