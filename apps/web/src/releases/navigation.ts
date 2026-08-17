import { PRODUCT_VERSION } from "./releaseNotes.ts";

export const UPDATES_NAVIGATION_EVENT = "wisemoney:updates-navigation";

type UpdatesHistoryState = {
  wisemoneyUpdates?: boolean;
};

export function isUpdatesPath(pathname = window.location.pathname): boolean {
  return pathname === "/updates" || pathname === "/updates/";
}

export function releaseAnchor(version = PRODUCT_VERSION): string {
  return `v${version}`;
}

export function openUpdates(version?: string): void {
  const hash = version == null ? "" : `#${encodeURIComponent(releaseAnchor(version))}`;
  const nextUrl = `/updates${hash}`;

  if (isUpdatesPath()) {
    window.history.replaceState(window.history.state, "", nextUrl);
  } else {
    const state: UpdatesHistoryState = {
      ...(window.history.state as object | null),
      wisemoneyUpdates: true,
    };
    window.history.pushState(state, "", nextUrl);
  }
  window.dispatchEvent(new Event(UPDATES_NAVIGATION_EVENT));
}

export function closeUpdates(): void {
  const state = window.history.state as UpdatesHistoryState | null;
  if (state?.wisemoneyUpdates === true && window.history.length > 1) {
    window.history.back();
    return;
  }

  window.history.replaceState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new Event(UPDATES_NAVIGATION_EVENT));
}
