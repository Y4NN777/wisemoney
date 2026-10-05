/** True when the app runs installed (home-screen PWA) rather than in a browser tab. */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
