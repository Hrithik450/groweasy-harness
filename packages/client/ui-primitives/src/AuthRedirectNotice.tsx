"use client";

/**
 * Surfaces the outcome of an OAuth round-trip.
 *
 * The gateway finishes every sign-in and connector callback by redirecting to
 * the app with `?error=<message>` (or `?meta_connected=true`). Without a
 * consumer the browser silently lands on a page whose only trace of the
 * failure is the URL, which reads as "nothing happened". This notice toasts
 * the message once, then removes the parameter from the URL so a refresh does
 * not repeat it.
 */

import { useEffect } from "react";
import { toast } from "sonner";

/** Query parameters owned by the OAuth redirects. */
const REDIRECT_PARAMS = ["error", "error_description"] as const;

/** Toast the redirect error once and strip it from the address bar. */
export function AuthRedirectNotice(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const message = REDIRECT_PARAMS.map((name) => params.get(name)).find(
      (value): value is string => Boolean(value),
    );
    if (!message) return;

    toast.error(message);

    const next = new URLSearchParams(window.location.search);
    for (const name of REDIRECT_PARAMS) next.delete(name);
    const query = next.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, []);

  return null;
}
