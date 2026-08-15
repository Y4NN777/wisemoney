export const HELP_NAVIGATION_EVENT = "wisemoney:help-navigation";

type HelpHistoryState = {
  wisemoneyHelp?: boolean;
};

export function isHelpPath(pathname = window.location.pathname): boolean {
  return pathname === "/help" || pathname === "/help/";
}

export function openHelp(sectionId?: string): void {
  const hash = sectionId == null ? "" : `#${encodeURIComponent(sectionId)}`;
  const nextUrl = `/help${hash}`;

  if (isHelpPath()) {
    window.history.replaceState(window.history.state, "", nextUrl);
  } else {
    const state: HelpHistoryState = { ...(window.history.state as object | null), wisemoneyHelp: true };
    window.history.pushState(state, "", nextUrl);
  }
  window.dispatchEvent(new Event(HELP_NAVIGATION_EVENT));
}

export function closeHelp(): void {
  const state = window.history.state as HelpHistoryState | null;
  if (state?.wisemoneyHelp === true && window.history.length > 1) {
    window.history.back();
    return;
  }

  window.history.replaceState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new Event(HELP_NAVIGATION_EVENT));
}
