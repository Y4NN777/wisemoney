import DashboardAttention from "../../components/DashboardAttention.tsx";
import type { FinancialStateSnapshot } from "../../domain/financialState.ts";

/** Home shows at most one attention card (ux-simplification decision 2); the rest opens from it. */
export default function AttentionCardHost({ snapshot }: { snapshot: FinancialStateSnapshot }) {
  return <DashboardAttention snapshot={snapshot} limit={1} />;
}
