/**
 * Browser caller for generic Connection unary RPC channels.
 *
 * Ported from `packages/client/connection/src/client/rpc.ts` in the reference
 * deepseek-harness repository. Request correlation, the `client-request`
 * envelope, response-envelope validation and target validation are unchanged.
 * The reference's multipart/binary projection is omitted because this harness
 * has no attachment-carrying unary results in this transport step.
 *
 * @module @openai-harness/client-connection
 */

import {
  RpcId,
  type ClientRequest,
  type ClientConnectionRpc,
  type ConnectionRpcResult,
  type RpcId as RpcIdType,
} from "../rpc";
import { USER_ID_HEADER } from "../user-id";
import { adoptClientUserId, getClientUserId } from "./user-identity";

const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/;
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;

/**
 * Transport this caller posts through; same signature as the global `fetch`.
 * Receives the document-relative route so a carrier resolves it against its own base.
 */
export type RpcFetch = (
  input: string | URL,
  init: RequestInit,
) => Promise<Response>;

/**
 * Create the browser-backed generic RPC caller.
 * @param doFetch - transport override; defaults to the page's global fetch.
 * @returns caller that owns request correlation and response-envelope validation.
 */
export function createWebConnectionRpc(doFetch?: RpcFetch): ClientConnectionRpc {
  const send: RpcFetch =
    doFetch ?? ((input, init) => globalThis.fetch(input, init));
  return {
    async call(channel, endpoint, payload, signal) {
      assertTarget(channel, endpoint);
      const rpcId = RpcId(randomUuid());
      const message: ClientRequest = {
        type: "client-request",
        rpcId,
        method: endpoint,
        payload,
      };
      // The channel key is absolute; a page posts the document-relative form, and
      // a carrier that resolves against the Host root accepts the same form.
      const route = `${channel}/${endpoint}`.slice(1);
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      try {
        // Stable anonymous identity from the first request; a signed session
        // cookie remains the authenticated path on the server.
        headers[USER_ID_HEADER] = getClientUserId();
      } catch {
        // A context without Web Crypto still gets server-minted identity.
      }
      const response = await send(route, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        ...(signal === undefined ? {} : { signal }),
      });
      // Adopt a server-resolved id only when this client has none.
      adoptClientUserId(response.headers?.get?.(USER_ID_HEADER) ?? undefined);
      if (!response.ok) {
        throw new Error(
          `transport failure for ${channel}/${endpoint}: HTTP ${response.status}`,
        );
      }
      const full = parseConnectionResponse(await response.json());
      signal?.throwIfAborted();
      if (full.rpcId !== rpcId) {
        throw new Error(
          `rpcId mismatch for ${endpoint}: sent ${rpcId}, got ${full.rpcId}`,
        );
      }
      return full.result;
    },
  };
}

function parseConnectionResponse(value: unknown): {
  readonly rpcId: RpcIdType;
  readonly result: ConnectionRpcResult<unknown>;
} {
  if (
    !isRecord(value) ||
    value.type !== "server-response" ||
    typeof value.rpcId !== "string"
  ) {
    throw new TypeError("connection: invalid server-response envelope");
  }
  const result = value.result;
  if (!isRecord(result)) {
    throw new TypeError("connection: invalid server-response result");
  }
  if (result.ok === true) {
    return {
      rpcId: RpcId(value.rpcId),
      result: { ok: true, value: result.value },
    };
  }
  if (result.ok !== false || !isRecord(result.error)) {
    throw new TypeError("connection: invalid server-response result");
  }
  const error = result.error;
  if (
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    !isRecord(error.details)
  ) {
    throw new TypeError("connection: invalid server-response failure");
  }
  return {
    rpcId: RpcId(value.rpcId),
    result: {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    },
  };
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertTarget(channel: string, endpoint: string): void {
  const segments = endpoint.split("/");
  if (
    !CHANNEL_PATTERN.test(channel) ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        !ENDPOINT_SEGMENT_PATTERN.test(segment),
    )
  ) {
    throw new Error(
      `connection: invalid RPC target ${JSON.stringify(`${channel}/${endpoint}`)}`,
    );
  }
}

function randomUuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rpc-${Math.random().toString(36).slice(2)}`;
}
