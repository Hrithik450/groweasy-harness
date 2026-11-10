/**
 * Connection transport: both halves, as in the reference repository.
 *
 * `src/*` is the node half — the authenticated `/api` HTTP route, its admission
 * fence and the `BrowserAuth` seam. `./client` is the browser half — the unary
 * caller. Both halves share the `client-request` / `server-response` envelopes,
 * the node:http ↔ Fetch bridge and the Peer scope.
 *
 * @module @openai-harness/client-connection
 */

export { Peer } from "./peer";
export type { PeerOptions, PeerScope } from "./peer";
export { bridge, DEFAULT_MAX_REQUEST_BODY_BYTES } from "./http-bridge";
export {
  clientRequestSchema,
  endpointForMethod,
  endpointFromPath,
  methodFromEndpoint,
  RpcId,
  rpcErrorSchema,
  rpcIdSchema,
  rpcMessageSchema,
  rpcResultSchema,
  serverResponseSchema,
  transportError,
} from "./rpc";
export type {
  ClientConnectionRpc,
  ClientRequest,
  ConnectionFetchHandler,
  ConnectionRequestBodyMode,
  ConnectionRpcFailure,
  ConnectionRpcHandlerResult,
  ConnectionRpcResult,
  RpcMessage,
  RpcPeer,
  ServerResponse,
} from "./rpc";

export { HostConnectionService } from "./rpc-host";
export { default } from "./rpc-host";
export type {
  ConnectionAdmission,
  ConnectionConfig,
  ConnectionRpcEndpointMatcher,
  ConnectionRpcHandler,
  HostConnectionHandle,
  HostConnectionRpc,
  PeerAdmission,
} from "./rpc-host";
export {
  BROWSER_AUTH_COOKIE_NAME,
  BROWSER_AUTH_SESSION_EXPIRY,
  BrowserAuthService,
} from "./browser-auth";
export type {
  BrowserAuth,
  BrowserAuthOptions,
  BrowserAuthSessionVerifier,
  BrowserAuthUser,
  BrowserAuthUserEnsurer,
  BrowserAuthUserLookup,
  BrowserAuthUserLookupResult,
  BrowserIdentity,
  BrowserIdentityRequest,
} from "./browser-auth";
export {
  firstHeaderValue,
  isUuidV7,
  mintUuidv7,
  USER_ID_COOKIE_NAME,
  USER_ID_HEADER,
  USER_ID_QUERY_PARAM,
  UUIDV7_PATTERN,
} from "./user-id";
