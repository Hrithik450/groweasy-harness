/**
 * Error vocabulary of the Session RPC surface.
 *
 * The class itself lives in `@openai-harness/sdk-protocol` so the Gateway can
 * map endpoint failures onto the wire envelope without depending on this host
 * package. It is re-exported here because call sites in this package (and its
 * tests) name failures through the Controller's barrel.
 *
 * @module @openai-harness/session-controller
 */

export { RpcError, type RpcErrorCode } from "@openai-harness/sdk-protocol";
