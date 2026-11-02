/**
 * Vocabulary shared by both ends of a unary RPC call.
 *
 * These live in the protocol because the Gateway and the Session Controller
 * both need them: the endpoint raises {@link RpcError}, the Gateway maps it to
 * the wire failure envelope, and every endpoint receives a {@link SessionCaller}
 * from the transport layer. Keeping them here lets the Gateway depend on the
 * protocol alone instead of reaching into a host package.
 *
 * @module @openai-harness/sdk-protocol
 */

/** Failure codes a session endpoint may raise across the RPC boundary. */
export type RpcErrorCode = "bad_request" | "not_found" | "internal";

/** Typed endpoint failure the Gateway maps onto the wire error vocabulary. */
export class RpcError extends Error {
  readonly code: RpcErrorCode;

  /**
   * @param code - stable endpoint failure code.
   * @param message - human diagnostic carried across the wire.
   */
  constructor(code: RpcErrorCode, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

/** Caller binding every Session endpoint method receives from the Gateway. */
export interface SessionCaller {
  /** Authenticated user the call speaks for. */
  readonly userId: string;
  /** Carrier cancellation for this call. */
  readonly signal: AbortSignal;
}
