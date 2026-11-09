import { Context, Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import {
  methodFromEndpoint,
  type PeerScope,
} from "@openai-harness/client-connection";
import type { RpcPeer } from "@openai-harness/client-connection";
import type { WebUpgradeRoute } from "@openai-harness/host-webserver";
import {
  remoteErrorOf,
  REMOTE_STREAM_MUX_PATH,
  rpcParamSchemas,
  TypertGatewayError,
  type RemoteStreamFailure,
  type RpcMethod,
  RpcError,
  type SessionCaller,
} from "@openai-harness/sdk-protocol";
import {
  RemoteStreamMuxServer,
  rejectRemoteStreamUpgrade,
  type RemoteStreamFailureMapper,
} from "./stream-server";

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Gateway-owned unary dispatch and Remote stream mux. */
    typertGateway: TypertGatewayService;
  }
}

/** Canonical stream endpoint for a live session follow. */
export const SESSION_FOLLOW_ENDPOINT = "session/follow";

/** Reference defaults, unchanged. */
const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 2_000;
const DEFAULT_STREAM_INBOX_BYTES = 262_144;
/** Largest delay a Node timer accepts; the reference imports this bound from `dsh-timeout`. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Gateway transport configuration. */
export interface Config {
  /** WebSocket Ping interval from 1 through 2,147,483,647 milliseconds. @default 2000 */
  readonly websocketHeartbeatIntervalMs?: number;
  /** Buffered uplink frame bytes one logical stream may hold before it fails with `gateway/uplink-overflow`. @default 262144 */
  readonly streamInboxBytes?: number;
}

interface ResolvedConfig extends Config {
  readonly websocketHeartbeatIntervalMs: number;
  readonly streamInboxBytes: number;
}

/**
 * Unary session endpoints and the Remote stream endpoint over Cordis services.
 *
 * @typert service typertGateway
 */
export class TypertGatewayService extends Service {
  static inject = ["webServer", "connection", "sessionController"];

  static Config: z<Config> = z.object({
    websocketHeartbeatIntervalMs: z
      .number()
      .step(1)
      .min(1)
      .max(MAX_TIMER_DELAY_MS)
      .default(DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS),
    streamInboxBytes: z
      .number()
      .step(1)
      .min(1)
      .default(DEFAULT_STREAM_INBOX_BYTES),
  });

  /**
   * Register the unary interceptor and the WebSocket mux against the Host
   * services. Both registrations own their lifetime through Cordis effects.
   * @param ctx - owning Context with Connection and WebServer access.
   * @param config - validated Gateway transport configuration.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, "typertGateway");
    const resolved = config as ResolvedConfig;

    ctx.inject(["connection"], (connectionCtx) => {
      connectionCtx.connection.rpc.intercept(
        "/api",
        (endpoint) => this.claimsEndpoint(endpoint),
        (endpoint, payload, signal, peer) =>
          this.dispatchRpc(endpoint, payload, signal, peer),
      );
    });

    ctx.inject(["connection", "webServer"], (webCtx) => {
      const mux = new RemoteStreamMuxServer(
        (endpoint, payload, uplink, peer, control) =>
          this.openWireStream(
            endpoint,
            payload,
            uplink,
            peer,
            control.signal,
            control,
          ),
        this.failure,
        resolved.websocketHeartbeatIntervalMs,
        resolved.streamInboxBytes,
      );
      const releases = new Set<Promise<void>>();
      webCtx.effect(function* () {
        yield async () => {
          await mux.close();
          await Promise.all(releases);
        };
        const route: WebUpgradeRoute = {
          path: REMOTE_STREAM_MUX_PATH,
          handler: async (req, socket, head) => {
            const admission = await webCtx.connection.admitConnection(req);
            if ("rejection" in admission) {
              rejectRemoteStreamUpgrade(socket, admission.rejection);
              return;
            }
            const release = (): void => {
              // release removes the API Peer synchronously, before awaiting
              // scope cleanup or any logical-stream iterator's return.
              const done = admission.release().catch((error: unknown) => {
                console.error("[api-gateway] Peer release failed:", error);
              });
              releases.add(done);
              void done.then(() => {
                releases.delete(done);
              });
            };
            const closed = (): void => {
              socket.removeListener("error", release);
              release();
            };
            socket.on("error", release);
            socket.once("close", closed);
            if (socket.destroyed) {
              closed();
              return;
            }
            try {
              mux.handleUpgrade(req, socket, head, admission.peer);
            } catch (error) {
              release();
              socket.destroy();
              console.error(
                "[api-gateway] Remote stream upgrade failed:",
                error,
              );
            }
          },
        };
        yield webCtx.webServer.registerUpgrade(route);
      }, `api-gateway: ${REMOTE_STREAM_MUX_PATH} WebSocket`);
    });
  }

  /** Mapper shared by the mux and any future in-process wire carrier. */
  readonly failure: RemoteStreamFailureMapper = (error) => rpcError(error);

  /** Synchronous ownership test for one endpoint on the shared channel. */
  private claimsEndpoint(endpoint: string): boolean {
    const method = methodFromEndpoint(endpoint);
    return method !== undefined && sessionMember(method) !== undefined;
  }

  private async dispatchRpc(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
    peer: RpcPeer,
  ): Promise<
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly error: RemoteStreamFailure }
  > {
    try {
      if (signal.aborted) {
        throw new TypertGatewayError(
          "gateway/invocation-unavailable",
          endpoint,
          "the calling request has been aborted",
        );
      }
      const method = methodFromEndpoint(endpoint);
      if (method === undefined || sessionMember(method) === undefined) {
        throw new TypertGatewayError(
          "gateway/invocation-unavailable",
          endpoint,
          "no active unary endpoint exports this path",
        );
      }
      const member = sessionMember(method) as string;
      const service: unknown = this.ctx.get("sessionController");
      if (!isObject(service)) {
        throw new TypertGatewayError(
          "gateway/invocation-unavailable",
          endpoint,
          'active Service "sessionController" is unavailable',
        );
      }
      const callable: unknown = Reflect.get(service, member);
      if (typeof callable !== "function") {
        throw new TypertGatewayError(
          "gateway/method-unavailable",
          endpoint,
          `active Service "sessionController" has no callable method ${JSON.stringify(member)}`,
        );
      }
      const args = decodeArgs(endpoint, payload, method);
      const caller: SessionCaller = { userId: peer.userId, signal };
      const value = await Reflect.apply(callable, service, [args, caller]);
      return { ok: true, value };
    } catch (error) {
      return rpcFailure(error);
    }
  }

  /**
   * Open one Remote stream. The stream carries no Client uplink, so its inbox
   * is released at once and later Client items are dropped.
   */
  private async openWireStream(
    endpoint: string,
    payload: unknown,
    uplink: AsyncIterable<unknown>,
    peer: PeerScope,
    signal: AbortSignal,
    control: AbortController,
  ): Promise<AsyncIterable<unknown>> {
    if (endpoint !== SESSION_FOLLOW_ENDPOINT) {
      throw new TypertGatewayError(
        "gateway/invocation-unavailable",
        endpoint,
        "no active Remote stream exports this endpoint",
      );
    }
    releaseUplink(uplink);
    assertPeerLive(peer, endpoint);
    const args = decodeStreamArgs(endpoint, payload);
    const lifetime = AbortSignal.any([signal, control.signal, peer.signal]);
    // Resolved by name so the Gateway keeps no compile-time dependency on the
    // host package that provides the service.
    const controller = this.ctx.get("sessionController") as
      | {
          follow(args: unknown, caller: SessionCaller): AsyncIterable<unknown>;
        }
      | undefined;
    if (controller === undefined) {
      throw new TypertGatewayError(
        "gateway/invocation-unavailable",
        endpoint,
        'active Service "sessionController" is unavailable',
      );
    }
    return controller.follow(args, {
      userId: peer.userId,
      signal: lifetime,
    });
  }
}

/**
 * Resolve the session service member behind one contract method.
 * `session.list` becomes `list`; the dotted extension becomes `block.submit`.
 * `detailBar.update` is owned by the same service under its literal name, so
 * the method itself is the member.
 * @param method - dotted contract method key.
 * @returns the service member, or `undefined` for a non-session method.
 */
export function sessionMember(method: RpcMethod): string | undefined {
  if (method === "detailBar.update") return method;
  const prefix = "session.";
  if (!method.startsWith(prefix)) return undefined;
  return method.slice(prefix.length);
}

/** Parse one unary payload and validate its args against the contract schema. */
function decodeArgs(
  endpoint: string,
  payload: unknown,
  method: RpcMethod,
): unknown {
  const args = payloadArgs(endpoint, payload);
  const schema = rpcParamSchemas[method];
  let parsed = schema.safeParse(args);
  if (!parsed.success && isEmptyObject(args)) {
    // Zero-parameter methods carry `{ args: {} }` on the wire because JSON has
    // no `undefined`; the contract schema for them is `z.void()`.
    parsed = schema.safeParse(undefined);
  }
  if (!parsed.success) {
    throw new TypertGatewayError(
      "gateway/arguments-invalid",
      endpoint,
      parsed.error.issues.map((issue) => issue.message).join("; ") ||
        "args do not match the contract",
    );
  }
  return parsed.data;
}

/** Parse the stream payload, whose args are validated by the stream opener. */
function decodeStreamArgs(endpoint: string, payload: unknown): unknown {
  return payloadArgs(endpoint, payload);
}

/** Exact `{ args }` payload shape shared by unary calls and streams. */
function payloadArgs(endpoint: string, payload: unknown): unknown {
  if (
    !isPlainObject(payload) ||
    Reflect.ownKeys(payload).length !== 1 ||
    !Object.hasOwn(payload, "args") ||
    !isPlainObject(payload.args)
  ) {
    throw new TypertGatewayError(
      "gateway/arguments-invalid",
      endpoint,
      "Remote payload must contain exactly one plain-object args field",
    );
  }
  return payload.args;
}

/** Remote and domain failures cross the wire; every other throw folds to internal. */
function rpcFailure(error: unknown): {
  readonly ok: false;
  readonly error: RemoteStreamFailure;
} {
  const remote = remoteErrorOf(error);
  if (remote !== undefined) {
    return {
      ok: false,
      error: {
        code: remote.code,
        message: remote.message,
        details: remote.details,
      },
    };
  }
  if (error instanceof RpcError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, details: {} },
    };
  }
  return {
    ok: false,
    error: {
      code: "gateway/internal",
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  };
}

function rpcError(
  error: unknown,
): RemoteStreamFailure & { readonly code: string } {
  return rpcFailure(error).error;
}

/** Refuse a call whose Peer has been disposed. */
function assertPeerLive(peer: PeerScope, endpoint: string): void {
  if (peer.signal.aborted) {
    throw new TypertGatewayError(
      "gateway/invocation-unavailable",
      endpoint,
      "the calling Peer has been disposed",
    );
  }
}

/**
 * Return a carrier uplink nobody will read, so it drops later items instead of
 * buffering them.
 * @param source - the carrier's uplink iterable.
 */
function releaseUplink(source: AsyncIterable<unknown>): void {
  void Promise.resolve()
    .then(() => source[Symbol.asyncIterator]().return?.())
    .catch(() => undefined);
}

function isEmptyObject(value: unknown): boolean {
  return isPlainObject(value) && Reflect.ownKeys(value).length === 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: object | null = Object.getPrototypeOf(value) as
    | object
    | null;
  return prototype === null || prototype === Object.prototype;
}

function isObject(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}

export default TypertGatewayService;
