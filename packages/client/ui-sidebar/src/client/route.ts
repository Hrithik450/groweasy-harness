/**
 * Route/pathname binding for the browser client.
 *
 * Replaces Next's `usePathname()`: the sidebar never imports a framework
 * router. The host may pass an explicit `pathname` through the slot owner
 * share; otherwise this binding reads `window.location.pathname` and
 * re-reads it on `popstate`, so plain `<a href>` navigation (and any shell
 * that pushes history) keeps the active-row styling correct.
 */
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getSnapshot(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

function getServerSnapshot(): string {
  return "";
}

/**
 * Read the current pathname, preferring a host-supplied binding.
 * @param override - shell-owned pathname, when the host renders the sidebar.
 * @returns the active pathname (empty during server rendering).
 */
export function useRoutePath(override?: string): string {
  const browserPathname = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return override ?? browserPathname;
}
