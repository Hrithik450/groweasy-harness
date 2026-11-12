/**
 * Gateway HTTP client for the Connector Manager.
 *
 * The connector UI used to call document-relative `/api/connectors/...` routes.
 * Inside the browser package the same routes are addressed on the Gateway
 * origin instead: the origin comes from `NEXT_PUBLIC_GATEWAY_URL` (which may be
 * spelled `ws(s)://` or `http(s)://`) and an injected fetch is used for tests
 * or hosts that own their own transport.
 */

/** Injectable transport configuration for {@link connectorsFetch}. */
export interface ConnectorsClientConfig {
  /** Gateway origin override; defaults to `NEXT_PUBLIC_GATEWAY_URL`. */
  baseUrl?: string;
  /** Fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

let config: ConnectorsClientConfig = {};

/** Override the Gateway origin and/or transport used by the connector UI. */
export function configureConnectorsClient(next: ConnectorsClientConfig): void {
  config = { ...config, ...next };
}

/** Restore the default Gateway origin and global fetch. */
export function resetConnectorsClient(): void {
  config = {};
}

/**
 * Resolve the configured Gateway origin.
 * @returns the raw configured URL (HTTP or WS spelling).
 */
export function resolveGatewayUrl(): string {
  return (
    config.baseUrl ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_GATEWAY_URL?.trim()
      : undefined) ??
    "ws://localhost:4000"
  );
}

/**
 * Convert the Gateway URL into its HTTP origin with a root path.
 * @param url - Gateway base, `ws(s)://` or `http(s)://` spelled.
 * @returns the HTTP origin ending in `/`.
 */
export function resolveGatewayHttpBase(url: string = resolveGatewayUrl()): string {
  const parsed = new URL(url);
  parsed.protocol =
    parsed.protocol === "wss:" || parsed.protocol === "https:"
      ? "https:"
      : "http:";
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

/**
 * Resolve a connector route against the Gateway origin.
 * @param input - route such as `/api/connectors`, or an absolute URL.
 * @returns the absolute URL.
 */
export function connectorsUrl(input: string): string {
  return /^https?:\/\//i.test(input)
    ? input
    : new URL(input, resolveGatewayHttpBase()).href;
}

/**
 * Fetch a connector route from the Gateway origin.
 * @param input - route such as `/api/connectors`, or an absolute URL.
 * @param init - standard request options.
 * @returns the Gateway response.
 */
export function connectorsFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const send = config.fetch ?? globalThis.fetch;
  return send(connectorsUrl(input), { credentials: "include", ...init });
}
