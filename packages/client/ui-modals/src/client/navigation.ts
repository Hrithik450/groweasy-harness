/**
 * Shell navigation binding.
 *
 * Replaces Next's `useRouter().push`. A shell that owns history supplies
 * {@link configureShellNavigation}; otherwise navigation falls back to a
 * normal browser visit so plain `<a href>`-style routing still works.
 */

/** Navigation hook supplied by the host shell. */
export type ShellNavigator = (href: string) => void;

let navigator: ShellNavigator | undefined;

/** Bind (or clear) the host's client-side navigation hook. */
export function configureShellNavigation(next: ShellNavigator | undefined): void {
  navigator = next;
}

/** Navigate to an application path, preferring the host's router. */
export function navigateTo(href: string): void {
  if (navigator) {
    navigator(href);
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign(href);
  }
}

/** Navigate to one session's chat route. */
export function navigateToSession(sessionId: string): void {
  navigateTo(`/c/${sessionId}`);
}
