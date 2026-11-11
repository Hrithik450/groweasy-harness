/**
 * Gateway auth URLs for the sidebar's sign-in action.
 *
 * The original component navigated to the Next app's relative
 * `/api/auth/google/login`. The gateway now serves that route, and the
 * browser client is deployed on a different origin, so the URL is built
 * against the gateway origin instead.
 *
 * The gateway base is read from the browser build's environment
 * (`VITE_GATEWAY_URL`, then the Next-compatible `NEXT_PUBLIC_GATEWAY_URL`),
 * falling back to the gateway's development default. The package stays
 * framework-free: it never imports Next, `@/lib`, or the RPC singleton.
 */

const DEFAULT_GATEWAY_URL = "http://localhost:4000";

let configuredGatewayUrl: string | undefined;

/**
 * Configure the gateway base for this browser build.
 * @param url - gateway HTTP(S) or WS(S) base; `undefined` clears the override.
 */
export function configureGatewayBaseUrl(url: string | undefined): void {
  configuredGatewayUrl = url?.trim() || undefined;
}

function readBuildEnv(): Record<string, string | undefined> {
  const meta = import.meta as { env?: Record<string, string | undefined> };
  const processLike = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  return { ...processLike?.env, ...meta.env };
}

/** Resolve the gateway base URL used by this browser build. */
export function resolveGatewayBaseUrl(): string {
  const env = readBuildEnv();
  return (
    configuredGatewayUrl ||
    env.VITE_GATEWAY_URL?.trim() ||
    env.NEXT_PUBLIC_GATEWAY_URL?.trim() ||
    DEFAULT_GATEWAY_URL
  );
}

/** Resolve the gateway's HTTP(S) origin from either an HTTP or WS base. */
export function resolveGatewayOrigin(): string {
  const base = resolveGatewayBaseUrl();
  const fallback =
    typeof window === "undefined" ? "http://localhost" : window.location.href;
  const url = new URL(base, fallback);
  url.protocol =
    url.protocol === "wss:" || url.protocol === "https:" ? "https:" : "http:";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

/** Callback parameters that must not ride into the next OAuth round-trip. */
const OAUTH_RETURN_PARAMS = [
  "open_connector",
  "meta_connected",
  "shopify_connected",
] as const;

/** Strip connector callback parameters from an app-relative return path. */
function cleanReturnTo(returnTo: string): string {
  try {
    const url = new URL(returnTo, "http://return.invalid");
    for (const name of OAUTH_RETURN_PARAMS) url.searchParams.delete(name);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return returnTo;
  }
}

/**
 * Build the Google sign-in URL on the gateway origin.
 *
 * @param returnTo - app-relative path to restore after sign-in.
 * @returns the absolute gateway login URL.
 *
 * The OAuth hop runs on the gateway (the registered `redirect_uri`), so the
 * page's own origin travels with it: the callback must send the browser back
 * to the UI host it started on, not to the gateway, which serves no `/c` route.
 */
export function googleLoginUrl(returnTo: string): string {
  const url = new URL("/api/auth/google/login", resolveGatewayOrigin());
  url.searchParams.set("returnTo", cleanReturnTo(returnTo));
  if (typeof window !== "undefined" && window.location.origin) {
    url.searchParams.set("returnOrigin", window.location.origin);
  }
  return url.href;
}
