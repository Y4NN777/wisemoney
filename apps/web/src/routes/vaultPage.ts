import { lazy, type ComponentType } from "react";

/**
 * A page inside the vault. The router waits for a `lazyRouteComponent` before it renders anything
 * on the matched path, so the landing page used to wait for the Home page's code (and the storage
 * and key-derivation libraries behind it). A React-lazy page is fetched only when it is rendered,
 * which is after the vault opens; the shell shows a placeholder meanwhile (see vaultShell.tsx).
 */
export function vaultPage(load: () => Promise<{ default: ComponentType }>) {
  return lazy(load);
}
