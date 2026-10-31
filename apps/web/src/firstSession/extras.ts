/**
 * Two optional steps after the three required ones (Y4NN, 2026-10-31): the voice test and the
 * assistant that is not available yet. They never block: the first session is already stored as
 * completed when they appear, so leaving at any point lands on Home as usual.
 */
export const FIRST_SESSION_EXTRAS = ["voice", "ai"] as const;
export type FirstSessionExtra = (typeof FIRST_SESSION_EXTRAS)[number];

/** The step after `step`, or null when the last extra was just left. */
export function nextExtra(step: FirstSessionExtra): FirstSessionExtra | null {
  const next = FIRST_SESSION_EXTRAS[FIRST_SESSION_EXTRAS.indexOf(step) + 1];
  return next ?? null;
}
