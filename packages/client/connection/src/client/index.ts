/**
 * Browser half of the Connection transport.
 *
 * Only the unary HTTP caller lives here: live streams travel through the
 * Gateway package's Remote stream mux client.
 *
 * @module @openai-harness/client-connection
 */

export { createWebConnectionRpc } from "./rpc";
export type { RpcFetch } from "./rpc";
export {
  adoptClientUserId,
  getClientUserId,
  peekClientUserId,
  persistClientUserId,
  USER_ID_STORAGE_KEY,
} from "./user-identity";
export {
  isUuidV7,
  mintUuidv7,
  USER_ID_COOKIE_NAME,
  USER_ID_HEADER,
  USER_ID_QUERY_PARAM,
  UUIDV7_PATTERN,
} from "../user-id";
// Shared, dependency-free endpoint translation. The browser half re-exports
// it so a client bundle never has to load the Node entry, which imports
// `node:crypto` and `node:stream`.
export { endpointForMethod, methodFromEndpoint } from "../rpc";
export type {
  ClientConnectionRpc,
  ClientRequest,
  ConnectionRpcFailure,
  ConnectionRpcResult,
  RpcId,
  ServerResponse,
} from "../rpc";
