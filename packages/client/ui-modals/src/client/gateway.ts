/**
 * Gateway origin for the modal package's HTTP actions.
 *
 * The application routes (`/api/download`, `/api/connectors/...`) now live on
 * the Gateway origin, which is normally a different origin from the browser
 * bundle. The base is read from the build environment (`VITE_GATEWAY_URL`,
 * then the Next-compatible `NEXT_PUBLIC_GATEWAY_URL`) and can be overridden by
 * the host. `ws(s)://` and `http(s)://` spellings are equivalent.
 */

const DEFAULT_GATEWAY_URL = "http://localhost:4000";

let configuredGatewayUrl: string | undefined;
let configuredFetch: typeof fetch | undefined;

/** Gateway origin and transport overrides for this browser build. */
export interface ModalsGatewayConfig {
  /** Gateway base; `undefined` clears the override. */
  url?: string;
  /** Replaces `globalThis.fetch` (tests or a host-owned transport). */
  fetch?: typeof fetch;
}

/** Bind a Gateway base URL and/or fetch implementation. */
export function configureModalsGateway(next: ModalsGatewayConfig): void {
  if (next.url !== undefined) configuredGatewayUrl = next.url.trim() || undefined;
  if (next.fetch !== undefined) configuredFetch = next.fetch;
}

/** Clear every Gateway binding. Primarily for tests. */
export function resetModalsGateway(): void {
  configuredGatewayUrl = undefined;
  configuredFetch = undefined;
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

/** Resolve the Gateway base URL used by this browser build. */
export function resolveGatewayBaseUrl(): string {
  const env = readBuildEnv();
  return (
    configuredGatewayUrl ||
    env.VITE_GATEWAY_URL?.trim() ||
    env.NEXT_PUBLIC_GATEWAY_URL?.trim() ||
    DEFAULT_GATEWAY_URL
  );
}

/**
 * Resolve the HTTP origin of the Gateway from either URL spelling.
 * @returns the origin ending in `/`.
 */
export function resolveGatewayHttpBase(): string {
  const fallback =
    typeof window === "undefined" ? "http://localhost" : window.location.href;
  const url = new URL(resolveGatewayBaseUrl(), fallback);
  url.protocol =
    url.protocol === "wss:" || url.protocol === "https:" ? "https:" : "http:";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href;
}

/**
 * Fetch one application route on the Gateway origin.
 * @param input - route such as `/api/download?...`, or an absolute URL.
 * @param init - standard request options.
 * @returns the Gateway response.
 */
export function gatewayFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const url = /^https?:\/\//i.test(input)
    ? input
    : new URL(input, resolveGatewayHttpBase()).href;
  const send = configuredFetch ?? globalThis.fetch;
  return send(url, { credentials: "include", ...init });
}
