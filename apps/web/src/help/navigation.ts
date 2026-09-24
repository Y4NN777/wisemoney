// The router is imported lazily: a static import would create an evaluation-time
// cycle (router.ts → routes → __root.tsx → this module) and break route creation.
let routerPromise: Promise<typeof import("../router.ts")> | null = null;
function loadRouter() {
  routerPromise ??= import("../router.ts");
  return routerPromise;
}

let openedFromApp = false;

export function isHelpPath(pathname = window.location.pathname): boolean {
  return pathname === "/help" || pathname === "/help/";
}

export function openHelp(sectionId?: string): void {
  openedFromApp = true;
  void loadRouter().then(({ router }) =>
    router.navigate({
      to: "/help",
      ...(sectionId == null ? {} : { hash: sectionId }),
    })
  );
}

export function closeHelp(): void {
  if (openedFromApp) {
    openedFromApp = false;
    void loadRouter().then(({ router }) => router.history.back());
    return;
  }
  void loadRouter().then(({ router }) => router.navigate({ to: "/" }));
}
