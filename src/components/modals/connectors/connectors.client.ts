/**
 * Browser-side HTTP helpers for the connector manager.
 *
 * Connector routes live on this app's own origin (`/api/connectors/**`), so a
 * connector hop is always same-origin: there is no second gateway to resolve,
 * and the session cookie travels with every request.
 */

/** Resolve the HTTP origin that serves the connector API routes. */
function resolveBaseUrl(): string {
  return typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000");
}

/** Resolve a connector route into an absolute URL. */
export function connectorsUrl(input: string): string {
  return /^https?:\/\//i.test(input)
    ? input
    : new URL(input, resolveBaseUrl()).href;
}

/** Fetch a connector route with the session cookie attached. */
export function connectorsFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(connectorsUrl(input), {
    credentials: "include",
    ...init,
  });
}
