import { useLayoutEffect, type RefObject } from "react";

/** A chat box grows with what is typed up to this height, then scrolls inside. */
const MAX_COMPOSER_HEIGHT_PX = 128;

/**
 * Sizes a one-line textarea to its text, with no scrollbar until the cap (Y4NN, 2026-10-16: an
 * ugly scrollbar in the WiseHelp box). Empty, it keeps its one-line height: a long placeholder
 * must fit on one line rather than grow the box.
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (element == null) return;
    element.style.height = "";
    if (value.length === 0) {
      element.style.overflowY = "hidden";
      return;
    }
    const full = element.scrollHeight;
    element.style.height = `${Math.min(full, MAX_COMPOSER_HEIGHT_PX)}px`;
    element.style.overflowY = full > MAX_COMPOSER_HEIGHT_PX ? "auto" : "hidden";
  }, [ref, value]);
}
