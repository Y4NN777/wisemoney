import { useEffect } from "react";

/**
 * How much of the bottom of the layout the on-screen keyboard covers: the layout height minus the
 * visible area (visualViewport). Zero where the browser already shrinks the layout for the keyboard
 * (Android Chrome with interactive-widget=resizes-content, index.html); positive on iPhone Safari.
 */
export function keyboardInset(layoutHeight: number, visibleHeight: number, visibleTop: number): number {
  return Math.max(0, Math.round(layoutHeight - visibleHeight - visibleTop));
}

const INSET_VARIABLE = "--keyboard-inset";

/** While mounted, keeps --keyboard-inset on <html> so a bottom sheet can sit above the keyboard. */
export function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport == null) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty(INSET_VARIABLE, `${keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop)}px`);
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty(INSET_VARIABLE);
    };
  }, []);
}
