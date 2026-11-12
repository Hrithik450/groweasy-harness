/**
 * Session RPC for the detail bar, routed through `@openai-harness/client-rpc`.
 *
 * The package owns no application configuration: the client is built here from
 * the browser build's gateway base, matching the sibling browser packages
 * (`ui-sidebar`, `ui-modals`). This keeps the detail bar usable in the
 * standalone browser app and avoids importing the application's `@/lib` shim.
 * Method names, params, and results come from the typed client.
 */
import { RpcClient } from "@openai-harness/client-rpc";

const DEFAULT_GATEWAY_URL = "http://localhost:4000";

let configuredGatewayUrl: string | undefined;
let shared: RpcClient | undefined;

/**
 * Configure the gateway base for this browser build.
 * @param url - gateway HTTP(S) or WS(S) base; `undefined` clears the override.
 */
export function configureDetailBarGateway(url: string | undefined): void {
  configuredGatewayUrl = url?.trim() || undefined;
  shared = undefined;
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
export function resolveDetailBarGatewayUrl(): string {
  const env = readBuildEnv();
  return (
    configuredGatewayUrl ||
    env.VITE_GATEWAY_URL?.trim() ||
    env.NEXT_PUBLIC_GATEWAY_URL?.trim() ||
    DEFAULT_GATEWAY_URL
  );
}

/** Lazily construct one process-wide client for this package. */
export function getDetailBarRpcClient(): RpcClient {
  shared ??= new RpcClient({ url: resolveDetailBarGatewayUrl() });
  return shared;
}
