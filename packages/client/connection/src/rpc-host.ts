import type { IncomingMessage, ServerResponse } from "node:http";
import { Context, Service } from "@deepseek-ai/cordis";
import { bridge, DEFAULT_MAX_REQUEST_BODY_BYTES } from "./http-bridge";
import { Peer, type PeerScope } from "./peer";
import {
  clientRequestSchema,
  endpointFromPath,
  RpcId,
  type ClientRequest,
  type ConnectionFetchHandler,
  type ConnectionRpcFailure,
  type ConnectionRpcHandlerResult,
  type RpcPeer,
} from "./rpc";
import type { BrowserIdentity } from "./browser-auth";
import { USER_ID_HEADER, USER_ID_QUERY_PARAM } from "./user-id";

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Host Connection transport and RPC registrations. */
    connection: HostConnectionHandle;
  }
}

const API_PATH = "/api" as const;
const INVALID_REQUEST_RPC_ID = RpcId("invalid-request");

/** Outcome of admitting one HTTP request. */
export type PeerAdmission =
  | BrowserIdentity
  | { readonly rejection: 401 | 403 };

/**
 * The request facts identity resolution needs. HTTP routes carry `url`;
 * callers that only hold headers still resolve an anonymous identity.
 */
type IdentifiableRequest = Pick<IncomingMessage, "headers"> & {
  readonly url?: string | undefined;
};

/**
 * Socket admission. Browser sockets share the user's Peer, so `release` is a
 * no-op: the Peer lives with this service. `409` stays in the union for API
 * carriers that claim exclusive ownership of a published peer.
 */
export type ConnectionAdmission =
  | {
      readonly peer: PeerScope;
      /** Safe carrier teardown hook; disposing the shared Peer is not its job. */
      readonly release: () => Promise<void>;
    }
  | { readonly rejection: 401 | 403 | 409 };

/** Handler invoked after Connection has decoded the transport envelope. */
export type ConnectionRpcHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
  peer: RpcPeer,
) => Promise<ConnectionRpcHandlerResult>;

/** Synchronous ownership test for one endpoint on the shared RPC channel. */
export type ConnectionRpcEndpointMatcher = (endpoint: string) => boolean;

/** Host registry for logical RPC endpoints carried by the shared channel. */
export interface HostConnectionRpc {
  intercept(
    channel: "/api",
    matches: ConnectionRpcEndpointMatcher,
    handler: ConnectionRpcHandler,
  ): () => Promise<void>;
}

/** Host `ctx.connection` members consumed by the Gateway. */
export interface HostConnectionHandle {
  readonly rpc: HostConnectionRpc;
  /** Apply the Origin fence and resolve the request's stable identity. */
  requestRejection(
    request: IdentifiableRequest,
  ): Promise<401 | 403 | undefined>;
  /** Resolve an HTTP request's identity; no socket ownership is claimed. */
  admit(request: IdentifiableRequest): Promise<PeerAdmission>;
  /** Admit a stream socket onto the user's shared Peer, creating it once. */
  admitConnection(request: IdentifiableRequest): Promise<ConnectionAdmission>;
  /** Compose the shared-channel Fetch handler. */
  createSharedFetchHandler(channel: "/api"): ConnectionFetchHandler;
}

/** Connection service configuration. */
export interface ConnectionConfig {
  /** Browser origins allowed to call the gateway. */
  readonly allowedOrigins: readonly string[];
  /** Maximum buffered JSON body for every `/api` request. */
  readonly maxRequestBodyBytes?: number;
}

interface ConnectionRpcInterceptor {
  readonly matches: ConnectionRpcEndpointMatcher;
  readonly fetchHandler: ConnectionFetchHandler;
}

interface PeerRecord {
  readonly userId: string;
  readonly peer: Peer;
}

/**
 * Host Connection service whose channel registrations belong to the caller
 * fiber and whose Peers are disposed with this service.
 */
export class HostConnectionService
  extends Service
  implements HostConnectionHandle
{
  static inject = ["browserAuth"];
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly maxRequestBodyBytes: number;
  private readonly peers = new Map<string, PeerRecord>();
  private readonly interceptors = new Map<string, ConnectionRpcInterceptor>();
  private disposed = false;

  constructor(ctx: Context, config: ConnectionConfig) {
    super(ctx, "connection");
    this.allowedOrigins = new Set(config.allowedOrigins);
    this.maxRequestBodyBytes =
      config.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES;
    ctx.effect(
      () => async () => {
        this.disposed = true;
        const records = [...this.peers.values()];
        this.peers.clear();
        await Promise.all(records.map((record) => record.peer.dispose()));
      },
      "client-connection: Peer scopes",
    );
    ctx.inject(["webServer"], (webCtx) => {
      webCtx.effect(() => {
        const route = {
          kind: "prefix" as const,
          path: API_PATH,
          handler: (req: IncomingMessage, res: ServerResponse) =>
            this.handleApi(req, res),
        };
        return webCtx.webServer.register(route);
      }, "client-connection: /api route");
    });
  }

  /** Generic channel registry scoped to the Context reading this service. */
  get rpc(): HostConnectionRpc {
    const owner = this.ctx;
    return {
      intercept: (channel, matches, handler) =>
        this.registerInterceptor(owner, channel, matches, handler),
    };
  }

  async requestRejection(
    request: IdentifiableRequest,
  ): Promise<401 | 403 | undefined> {
    const admission = await this.admit(request);
    return "rejection" in admission ? admission.rejection : undefined;
  }

  async admit(
    request: IdentifiableRequest,
  ): Promise<PeerAdmission> {
    const origin = request.headers.origin;
    if (typeof origin === "string" && !this.allowedOrigins.has(origin)) {
      return { rejection: 403 };
    }
    if (this.disposed) return { rejection: 401 };
    try {
      // A valid session cookie wins; otherwise the carrier resolves (or mints)
      // the caller's anonymous UUIDv7, creating the user record through the
      // injected ensure seam so sessions and connectors attach to one tenant.
      return await this.ctx.browserAuth.resolve({
        cookie: request.headers.cookie,
        headerUserId: request.headers[USER_ID_HEADER],
        queryUserId: queryUserIdOf(request),
      });
    } catch (error) {
      this.ctx.logger.warn(
        error instanceof Error ? error : new Error(String(error)),
      );
      return { rejection: 401 };
    }
  }

  async admitConnection(
    request: IdentifiableRequest,
  ): Promise<ConnectionAdmission> {
    const admission = await this.admit(request);
    if ("rejection" in admission) return admission;
    // Browser sockets share one Peer per user, mirroring the reference's
    // `browserPeer`: a second tab, or a reconnect racing its predecessor's
    // close, is admitted instead of rejected. The Peer belongs to this
    // service, not to any one socket, so closing a socket releases nothing.
    let record = this.peers.get(admission.userId);
    if (record === undefined) {
      const peer = await Peer.create(this.ctx, { userId: admission.userId });
      record = { userId: admission.userId, peer };
      this.peers.set(admission.userId, record);
    }
    return { peer: record.peer, release: () => Promise.resolve() };
  }

  createSharedFetchHandler(channel: "/api"): ConnectionFetchHandler {
    return {
      requestBodyMode: () => "buffered",
      fetch: (request, peer) => {
        const endpoint = endpointFromPath(
          channel,
          new URL(request.url).pathname,
        );
        const interceptor = this.interceptors.get(channel);
        if (
          endpoint === undefined ||
          interceptor === undefined ||
          !interceptor.matches(endpoint)
        ) {
          return Promise.resolve(new Response("not found", { status: 404 }));
        }
        return interceptor.fetchHandler.fetch(request, peer);
      },
    };
  }

  private async handleApi(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const rawPath = new URL(req.url ?? "/", "http://x").pathname;
    if (rawPath.startsWith("/api/auth/")) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found\n");
      return;
    }
    const origin =
      typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (origin !== undefined && !this.allowedOrigins.has(origin)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    // The frontend lives on another origin in this deployment; the preflight is
    // answered before admission because browsers never attach credentials to it.
    if (req.method === "OPTIONS") {
      this.writeCors(res, origin);
      res.writeHead(204, {
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": `content-type, ${USER_ID_HEADER}`,
        "access-control-max-age": "600",
      });
      res.end();
      return;
    }
    const admission = await this.admit(req);
    if ("rejection" in admission) {
      res.writeHead(admission.rejection);
      res.end(admission.rejection === 401 ? "unauthorized" : "forbidden");
      return;
    }
    // Tell an anonymous caller which stable id its requests belong to; a
    // browser that had not persisted one adopts this value.
    if (admission.anonymous) {
      res.setHeader(USER_ID_HEADER, admission.userId);
    }
    this.writeCors(res, origin);
    await bridge(
      req,
      res,
      this.createSharedFetchHandler(API_PATH),
      { userId: admission.userId },
      this.maxRequestBodyBytes,
    );
  }

  private writeCors(res: ServerResponse, origin: string | undefined): void {
    if (origin === undefined) return;
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-expose-headers", USER_ID_HEADER);
    res.setHeader("vary", "origin");
  }

  private registerInterceptor(
    owner: Context,
    channel: "/api",
    matches: ConnectionRpcEndpointMatcher,
    handler: ConnectionRpcHandler,
  ): () => Promise<void> {
    if (channel !== API_PATH) {
      throw new Error(
        `connection: invalid shared RPC channel ${JSON.stringify(channel)}`,
      );
    }
    const interceptor: ConnectionRpcInterceptor = {
      matches,
      fetchHandler: rpcFetchHandler(channel, handler),
    };
    return owner.effect(() => {
      if (this.interceptors.has(channel)) {
        throw new Error(
          `connection: shared RPC channel ${JSON.stringify(channel)} already has an interceptor`,
        );
      }
      this.interceptors.set(channel, interceptor);
      return () => {
        this.interceptors.delete(channel);
      };
    }, `client-connection: ${channel} rpc interceptor`);
  }
}

/** Read the `userId` query parameter, if the request carries a URL. */
function queryUserIdOf(request: IdentifiableRequest): string | undefined {
  if (request.url === undefined) return undefined;
  try {
    return (
      new URL(request.url, "http://connection.internal").searchParams.get(
        USER_ID_QUERY_PARAM,
      ) ?? undefined
    );
  } catch {
    return undefined;
  }
}

function rpcFetchHandler(
  channel: string,
  handler: ConnectionRpcHandler,
): ConnectionFetchHandler {
  return {
    requestBodyMode: () => "buffered",
    async fetch(request: Request, peer: RpcPeer): Promise<Response> {
      const endpoint = endpointFromPath(channel, new URL(request.url).pathname);
      if (request.method !== "POST" || endpoint === undefined) {
        return new Response("not found", { status: 404 });
      }

      const mediaType = request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (mediaType !== "application/json") {
        return new Response("content type must be application/json", {
          status: 415,
        });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response("body is not JSON", { status: 400 });
      }

      const envelope = clientRequestSchema.safeParse(body);
      if (!envelope.success) {
        return invalidEnvelopeResponse(body, envelope.error.issues);
      }
      const message: ClientRequest = envelope.data;
      if (message.method !== endpoint) {
        return errorResponse(message.rpcId, {
          code: "gateway/bad-request",
          message: `method ${JSON.stringify(message.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
          details: { issues: [] },
        });
      }

      try {
        const result = await handler(
          endpoint,
          message.payload,
          request.signal,
          peer,
        );
        return fullResponse(message.rpcId, result);
      } catch (error) {
        return new Response(`handler failure: ${String(error)}`, {
          status: 500,
        });
      }
    },
  };
}

function invalidEnvelopeResponse(
  body: unknown,
  issues: readonly object[],
): Response {
  const rawId = (body as { rpcId?: unknown } | null)?.rpcId;
  const rpcId =
    typeof rawId === "string" ? RpcId(rawId) : INVALID_REQUEST_RPC_ID;
  return errorResponse(rpcId, {
    code: "gateway/bad-request",
    message: "invalid client-request message",
    details: { issues },
  });
}

function errorResponse(rpcId: RpcId, error: ConnectionRpcFailure): Response {
  return fullResponse(rpcId, { ok: false, error });
}

function fullResponse(
  rpcId: RpcId,
  result: ConnectionRpcHandlerResult,
): Response {
  return Response.json({ type: "server-response", rpcId, result });
}

export default HostConnectionService;
