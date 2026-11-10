/**
 * Unary Connection RPC envelopes and endpoint paths.
 *
 * Ported from `packages/client/connection/src/rpc.ts` and
 * `packages/client/connection/src/rpc-schema.ts` in the reference
 * deepseek-harness repository, restricted to the shapes this gateway carries:
 * no attachments, no exact Fetch routes, and no binary projection.
 *
 * The method surface of this repository keeps its dotted contract keys
 * (`session.list`). The transport spelling is the reference endpoint form
 * `<namespace>/<method>` (`session/list`, and `session/block.submit` for the
 * dotted extension method); {@link endpointForMethod} and
 * {@link methodFromEndpoint} are the only translation points.
 *
 * @module @openai-harness/client-connection
 */

import { z } from "zod";
import { RPC_METHODS, type RpcMethod } from "@openai-harness/sdk-protocol";

/** Correlation id minted by a caller and echoed by the Connection response. */
export type RpcId = string;

/** Brand one validated string as a Connection correlation id. */
export function RpcId(id: string): RpcId {
  return id;
}

/** Carrier-neutral failure returned by one logical RPC endpoint. */
export interface ConnectionRpcFailure {
  readonly code: string;
  readonly message: string;
  readonly details: object;
}

/** Carrier-neutral result returned by one logical RPC endpoint. */
export type ConnectionRpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ConnectionRpcFailure };

/** Successful or failed handler result ready for Connection transport framing. */
export type ConnectionRpcHandlerResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: ConnectionRpcFailure };

/** Full request envelope carried by the HTTP Connection transport. */
export interface ClientRequest {
  readonly type: "client-request";
  readonly rpcId: RpcId;
  readonly method: string;
  readonly payload: unknown;
}

/** Full response envelope carried by the HTTP Connection transport. */
export interface ServerResponse {
  readonly type: "server-response";
  readonly rpcId: RpcId;
  readonly result: ConnectionRpcResult<unknown>;
}

/** Complete Connection RPC envelope union. */
export type RpcMessage = ClientRequest | ServerResponse;

/** Authenticated request identity carried to an HTTP RPC handler. */
export interface RpcPeer {
  readonly userId: string;
}

/** How the node:http bridge presents one request body to its Fetch handler. */
export type ConnectionRequestBodyMode = "buffered" | "streaming";

/** Transport-independent Fetch handler used by the HTTP carrier. */
export interface ConnectionFetchHandler {
  requestBodyMode(request: {
    readonly method: string;
    readonly url: URL;
  }): ConnectionRequestBodyMode;
  fetch(request: Request, peer: RpcPeer): Promise<Response>;
}

/** Client caller for logical RPC channels carried by the current transport. */
export interface ClientConnectionRpc {
  /**
   * Call one endpoint through an already registered logical channel.
   * @param channel - absolute logical channel such as `/api`.
   * @param endpoint - channel-relative endpoint such as `session/list`.
   * @param payload - channel-owned request payload.
   * @param signal - optional caller cancellation.
   * @returns the endpoint-owned success/error result; correlation stays inside Connection.
   */
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>>;
}

/** Runtime validation for one correlation id. */
export const rpcIdSchema = z.string() as unknown as z.ZodType<RpcId>;

/** Generic endpoint failure carried in a response envelope. */
export const rpcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
});

/**
 * Build the result parser for one endpoint value parser.
 * @param value - endpoint-owned success-value parser.
 * @returns parser for either a success value or generic failure.
 */
export function rpcResultSchema<T>(value: z.ZodType<T>): z.ZodType<
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: z.infer<typeof rpcErrorSchema>;
    }
> {
  // Zod widens the discriminator of the failure branch; the runtime shape is
  // the declared union, and parsing is the only consumer.
  return z.union([
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: false, error: rpcErrorSchema }),
  ]) as unknown as z.ZodType<
    | { readonly ok: true; readonly value: T }
    | {
        readonly ok: false;
        readonly error: z.infer<typeof rpcErrorSchema>;
      }
  >;
}

/** Client request envelope; endpoint payload validation belongs to its owner. */
export const clientRequestSchema = z.object({
  type: z.literal("client-request"),
  rpcId: rpcIdSchema,
  method: z.string(),
  payload: z.unknown(),
}) as z.ZodType<ClientRequest>;

/** Server response envelope; endpoint value validation belongs to its caller. */
export const serverResponseSchema = z.object({
  type: z.literal("server-response"),
  rpcId: rpcIdSchema,
  result: rpcResultSchema(z.unknown()),
}) as z.ZodType<ServerResponse>;

/** Either Connection RPC envelope direction. */
export const rpcMessageSchema = z.discriminatedUnion("type", [
  clientRequestSchema as unknown as z.ZodObject<z.ZodRawShape>,
  serverResponseSchema as unknown as z.ZodObject<z.ZodRawShape>,
]) as unknown as z.ZodType<RpcMessage>;

/** Endpoint segment grammar from the reference `endpointFromPath`. */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;

/**
 * Translate one contract method key to its transport endpoint.
 * @param method - dotted contract method key.
 * @returns `<namespace>/<method>` transport spelling.
 */
export function endpointForMethod(method: RpcMethod): string {
  const dot = method.indexOf(".");
  return `${method.slice(0, dot)}/${method.slice(dot + 1)}`;
}

/**
 * Translate one transport endpoint back to a contract method key.
 * @param endpoint - `<namespace>/<method>` transport spelling.
 * @returns the contract method key, or `undefined` when it is not part of the contract.
 */
export function methodFromEndpoint(endpoint: string): RpcMethod | undefined {
  const slash = endpoint.indexOf("/");
  if (slash === -1) return undefined;
  const candidate = `${endpoint.slice(0, slash)}.${endpoint.slice(slash + 1)}`;
  return (RPC_METHODS as readonly string[]).includes(candidate)
    ? (candidate as RpcMethod)
    : undefined;
}

/**
 * Extract the channel-relative endpoint from a request pathname, exactly as
 * the reference `endpointFromPath` validates it.
 * @param channel - absolute shared channel such as `/api`.
 * @param pathname - request pathname.
 * @returns the endpoint, or `undefined` when the pathname is not one.
 */
export function endpointFromPath(
  channel: string,
  pathname: string,
): string | undefined {
  if (!pathname.startsWith(`${channel}/`)) return undefined;
  const endpoint = pathname.slice(channel.length + 1);
  const segments = endpoint.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        !ENDPOINT_SEGMENT_PATTERN.test(segment),
    )
  ) {
    return undefined;
  }
  return endpoint;
}

/**
 * Convert a rejected transport operation into a generic failure result.
 * @param error - rejected transport value.
 * @returns an `internal` failure preserving the available message.
 */
export function transportError<T>(error: unknown): ConnectionRpcResult<T> {
  return {
    ok: false,
    error: {
      code: "gateway/internal",
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  };
}
