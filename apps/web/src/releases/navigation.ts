import { PRODUCT_VERSION } from "./releaseNotes.ts";

// The router is imported lazily: a static import would create an evaluation-time
// cycle (router.ts → routes → __root.tsx → this module) and break route creation.
let routerPromise: Promise<typeof import("../router.ts")> | null = null;
function loadRouter() {
  routerPromise ??= import("../router.ts");
  return routerPromise;
}

let openedFromApp = false;

export function isUpdatesPath(pathname = window.location.pathname): boolean {
  return pathname === "/updates" || pathname === "/updates/";
}

export function releaseAnchor(version = PRODUCT_VERSION): string {
  return `v${version}`;
}

export function openUpdates(version?: string): void {
  openedFromApp = true;
  void loadRouter().then(({ router }) =>
    router.navigate({
      to: "/updates",
      ...(version == null ? {} : { hash: releaseAnchor(version) }),
    })
  );
}

export function closeUpdates(): void {
  if (openedFromApp) {
    openedFromApp = false;
    void loadRouter().then(({ router }) => router.history.back());
    return;
  }
  void loadRouter().then(({ router }) => router.navigate({ to: "/" }));
}
