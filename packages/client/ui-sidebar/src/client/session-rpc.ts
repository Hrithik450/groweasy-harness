/**
 * Session actions for the sidebar, routed through `@openai-harness/client-rpc`.
 *
 * The package owns no app configuration: the client is constructed here from
 * the same gateway base used for auth links. This keeps the sidebar usable in
 * the standalone browser app and avoids importing the application's `@/lib`
 * shim. Method names, params, and results come from the typed client.
 */
import { RpcClient } from "@openai-harness/client-rpc";
import type { SessionView } from "@openai-harness/session";
import { resolveGatewayBaseUrl } from "./auth";

let shared: RpcClient | undefined;
let sharedUrl: string | undefined;

/**
 * Lazily construct one process-wide client for this package, rebuilding it if
 * the host rebinds the gateway base between actions.
 */
function rpc(): RpcClient {
  const url = resolveGatewayBaseUrl();
  if (!shared || sharedUrl !== url) {
    shared = new RpcClient({ url });
    sharedUrl = url;
  }
  return shared;
}

/** Drop the cached client (tests or a gateway rebind). */
export function resetSessionRpc(): void {
  shared = undefined;
  sharedUrl = undefined;
}

/** List every session owned by the signed-in caller. */
export function listSessions(): Promise<SessionView[]> {
  return rpc().call("session.list", undefined);
}

/** Create one empty session and return its view. */
export function createSession(title = "New session"): Promise<SessionView> {
  return rpc().call("session.create", { title });
}

/** Resolve one session before/while the shell opens it. */
export function selectSession(sessionId: string): Promise<SessionView> {
  return rpc().call("session.inspect", { sessionId });
}
