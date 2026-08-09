export type DashboardMode = "setup" | "first-transaction" | "active";

export function getDashboardMode(activeAccountCount: number, hasTransactions: boolean): DashboardMode {
  if (activeAccountCount === 0) return "setup";
  return hasTransactions ? "active" : "first-transaction";
}
