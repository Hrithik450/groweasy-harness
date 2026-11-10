/**
 * Session creation for the New Session modal.
 *
 * The original modal called the application's process-wide RPC singleton.
 * This package owns a lazily constructed `RpcClient` instead, pointed at the
 * same Gateway base as its HTTP routes, so it has no Next or `@/lib` import.
 */
import { RpcClient } from "@openai-harness/client-rpc";
import type { SessionView } from "@openai-harness/session";
import { resolveGatewayBaseUrl } from "./gateway";

let shared: RpcClient | undefined;

/** Lazily construct one browser client for this package. */
function rpc(): RpcClient {
  shared ??= new RpcClient({ url: resolveGatewayBaseUrl() });
  return shared;
}

/** Drop the cached client (tests or a Gateway rebind). */
export function resetSessionRpc(): void {
  shared = undefined;
}

/** Create one session through the typed gateway method. */
export function createSession(title: string): Promise<SessionView> {
  return rpc().call("session.create", { title });
}
