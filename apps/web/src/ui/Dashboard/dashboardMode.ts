export type DashboardMode = "first-transaction" | "active";

/**
 * The vault opens ready to capture: the first movement silently creates the
 * default account, so the old "setup" mode (account required before capture)
 * collapsed into "first-transaction" (docs/plans/ux-simplification-implementation.md).
 */
export function getDashboardMode(hasOperations: boolean): DashboardMode {
  return hasOperations ? "active" : "first-transaction";
}
