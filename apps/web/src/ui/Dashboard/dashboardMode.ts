export type DashboardMode = "setup" | "first-transaction" | "active";

export function getDashboardMode(activeAccountCount: number, hasOperations: boolean): DashboardMode {
  if (activeAccountCount === 0) return "setup";
  return hasOperations ? "active" : "first-transaction";
}
