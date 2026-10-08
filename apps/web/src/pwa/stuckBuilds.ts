/**
 * Entry scripts of the four builds deployed on 2026-10-08 (4b1df2a, ebde3a9, 7e77bd2, b6eb78d)
 * that never activate a waiting version and that phones never close: devices running one stay on
 * it. Names read from the live site, or from a rebuild of the commit whose method was checked
 * against a live name (b6eb78d gave B_0kXTWF both ways).
 */
const STUCK_ENTRY_SCRIPTS = new Set([
  "/assets/index-COZQa_8v.js",
  "/assets/index-090TeVxY.js",
  "/assets/index-CDpsA9aq.js",
  "/assets/index-B_0kXTWF.js",
]);

/** True when the precache still holds a stuck build, so the new worker must take over itself. */
export function cacheHoldsStuckBuild(cachedUrls: readonly string[]): boolean {
  return cachedUrls.some((url) => STUCK_ENTRY_SCRIPTS.has(new URL(url).pathname));
}
