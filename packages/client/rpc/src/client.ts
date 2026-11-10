/**
 * Framework-free browser transport client for the agent gateway.
 *
 * The transport split matches the reference deepseek-harness Connection:
 * unary methods are HTTP `POST /api/<namespace>/<method>` envelopes, and live
 * streams share the Gateway's Remote stream WebSocket mux at
 * `/api/remote.mux`.
 *
 * Ported pieces:
 * - {@link createWebConnectionRpc} from `@openai-harness/client-connection`
 *   owns unary request correlation and envelope validation.
 * - `RemoteStreamMuxClient` from `@openai-harness/api-gateway/client` owns the
 *   physical socket and the `open`/`item`/`error`/`end` frames.
 *
 * Adaptation: the reference wraps each logical stream in a Cordis
 * `RemoteStream` supervisor paced by Connection generations. This browser
 * client has no Connection plugin in this transport step, so {@link RpcClient}
 * runs the same reopen loop itself: exponential backoff, a fresh mux per
 * generation, and `afterSeq` advanced from the accepted snapshot cursor or
 * event sequence.
 *
 * This module deliberately reads no application configuration at module
 * scope: callers pass the gateway URL in {@link RpcClientOptions}. The Next.js
 * application supplies it from `@/lib/rpc/client`.
 *
 * @module @openai-harness/client-rpc
 */

import {
  RemoteStreamCarrierError,
  RemoteStreamMuxClient,
  type ConnectionWebSocket,
} from "@openai-harness/api-gateway/client";
import {
  createWebConnectionRpc,
  endpointForMethod,
  getClientUserId,
  USER_ID_QUERY_PARAM,
  type RpcFetch,
} from "@openai-harness/client-connection/client";
import {
  type RpcRequestMap,
  type RpcMethod,
  type RpcSubscriptionMap,
  type RpcChannel,
  type SessionFollowFrame,
} from "@openai-harness/sdk-protocol";

/** Minimal physical socket surface shared by browsers and test doubles. */
export type RpcSocket = ConnectionWebSocket;

/** Create one physical stream socket for a resolved mux URL. */
export type RpcSocketFactory = (url: string) => RpcSocket;

const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 8_000;

/** One unary call's local cancellation. */
export interface RpcCallOptions {
  /** Rejects locally and abandons the response. */
  signal?: AbortSignal;
}

/** One live follow subscription. */
export interface RpcSubscription {
  readonly subscriptionId: string;
  close(): void;
}

/** Failure returned by a Gateway endpoint; code and details stay available. */
export class RpcClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: object,
  ) {
    super(message);
    this.name = "RpcClientError";
  }
}

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rpc-${Math.random().toString(36).slice(2)}`;
}

export interface RpcClientOptions {
  /** Gateway base; `ws(s)://` and `http(s)://` spellings are equivalent. */
  url: string;
  /** Physical stream socket factory, normally the global `WebSocket`. */
  socketFactory?: RpcSocketFactory;
  /** Reopen subscriptions after a carrier loss. @default true */
  autoReconnect?: boolean;
  /** Unary HTTP override used by tests. */
  fetch?: RpcFetch;
}

/** Resolve the HTTP base of one gateway URL. */
function gatewayHttpBase(url: string): string {
  const parsed = new URL(url);
  parsed.protocol =
    parsed.protocol === "wss:" || parsed.protocol === "https:"
      ? "https:"
      : "http:";
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

/** Resolve the Remote stream mux socket URL from the gateway base. */
function streamUrl(url: string): string {
  const parsed = new URL("/api/remote.mux", gatewayHttpBase(url));
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  // A browser cannot attach headers to a WebSocket upgrade, so the stable
  // anonymous id travels as the same query parameter the gateway reads.
  if (!parsed.searchParams.has(USER_ID_QUERY_PARAM)) {
    try {
      parsed.searchParams.set(USER_ID_QUERY_PARAM, getClientUserId());
    } catch {
      // Leave the URL unchanged when Web Crypto/storage is unavailable.
    }
  }
  return parsed.href;
}

/** Abortable retry delay. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, ms);
    const aborted = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", aborted, { once: true });
  });
}

/**
 * Typed gateway client.
 *
 * Calls travel as unary HTTP requests. Subscriptions open one long-lived
 * Remote stream and, unless `autoReconnect` is false, reopen it after a
 * carrier loss using the cursor of the last accepted follow frame.
 */
export class RpcClient {
  private readonly url: string;
  private readonly factory: RpcSocketFactory;
  private readonly autoReconnect: boolean;
  private readonly rpc;
  private readonly subscriptions = new Set<() => void>();
  private closed = false;

  constructor(options: RpcClientOptions) {
    this.url = options.url;
    this.factory =
      options.socketFactory ??
      ((url) => new WebSocket(url) as unknown as RpcSocket);
    this.autoReconnect = options.autoReconnect ?? true;

    const httpBase = gatewayHttpBase(this.url);
    const send: RpcFetch =
      options.fetch ??
      ((input, init) => globalThis.fetch(input, init));
    this.rpc = createWebConnectionRpc((input, init) =>
      send(new URL(String(input), httpBase).href, {
        ...init,
        credentials: "include",
      }),
    );
  }

  /**
   * Invoke one typed unary method.
   * @param method - contract method name.
   * @param params - validated method params.
   * @param options - caller cancellation.
   */
  async call<M extends RpcMethod>(
    method: M,
    params: RpcRequestMap[M]["params"],
    options: RpcCallOptions = {},
  ): Promise<RpcRequestMap[M]["result"]> {
    if (this.closed) throw new Error("RPC client closed");
    options.signal?.throwIfAborted();
    const result = await this.rpc.call(
      "/api",
      endpointForMethod(method),
      { args: params ?? {} },
      options.signal,
    );
    if (!result.ok) {
      throw new RpcClientError(
        result.error.code,
        result.error.message,
        result.error.details,
      );
    }
    return result.value as RpcRequestMap[M]["result"];
  }

  /**
   * Subscribe to one typed stream channel.
   * @param channel - contract channel name.
   * @param params - validated channel params.
   * @param onEvent - receives the opening frame and every later frame.
   * @returns once the opening frame has been delivered.
   */
  async subscribe<C extends RpcChannel>(
    channel: C,
    params: RpcSubscriptionMap[C]["params"],
    onEvent: (event: RpcSubscriptionMap[C]["event"]) => void,
  ): Promise<RpcSubscription> {
    if (this.closed) throw new Error("RPC client closed");
    const subscriptionId = randomId();
    const lifetime = new AbortController();
    let settled = false;
    let resolveOpened: (() => void) | undefined;
    let rejectOpened: ((error: unknown) => void) | undefined;
    const opened = new Promise<void>((resolve, reject) => {
      resolveOpened = resolve;
      rejectOpened = reject;
    });

    const close = (): void => {
      if (lifetime.signal.aborted) return;
      this.subscriptions.delete(close);
      lifetime.abort(new Error("RPC subscription closed"));
      if (!settled) {
        settled = true;
        rejectOpened?.(new Error("RPC subscription closed"));
      }
    };
    this.subscriptions.add(close);

    void this.pump(
      channel,
      params,
      (frame) => {
        if (!settled) {
          settled = true;
          resolveOpened?.();
        }
        onEvent(frame);
      },
      lifetime.signal,
    ).catch((error: unknown) => {
      if (!settled) {
        settled = true;
        rejectOpened?.(error);
        return;
      }
      if (!lifetime.signal.aborted) {
        console.error("[rpc] session follow stream failed", error);
      }
    });

    await opened;
    return { subscriptionId, close };
  }

  /** Close every subscription and reject pending openings. */
  close(): void {
    this.closed = true;
    for (const close of [...this.subscriptions]) close();
  }

  /**
   * Open one logical follow generation, reopen it after a recoverable carrier
   * loss, and deliver frames until the subscription is closed.
   */
  private async pump<C extends RpcChannel>(
    channel: C,
    params: RpcSubscriptionMap[C]["params"],
    deliver: (frame: RpcSubscriptionMap[C]["event"]) => void,
    signal: AbortSignal,
  ): Promise<void> {
    if (channel !== "session.follow") {
      throw new Error(`unknown subscription channel ${channel}`);
    }
    const follow = params as RpcSubscriptionMap["session.follow"]["params"];
    let afterSeq = follow.afterSeq;
    let attempt = 0;

    while (!signal.aborted) {
      const mux = new RemoteStreamMuxClient(
        () => this.factory(streamUrl(this.url)),
        false,
      );
      mux.start();
      try {
        const payload = {
          args: {
            ...follow,
            ...(afterSeq !== undefined ? { afterSeq } : {}),
          },
        };
        for await (const value of mux.open(
          "session/follow",
          payload,
          signal,
        )) {
          const frame = value as SessionFollowFrame;
          if (frame.type === "snapshot") {
            attempt = 0;
            if (frame.cursor >= 0) afterSeq = frame.cursor;
          } else if (frame.type === "event") {
            const seq = frame.event.seq;
            if (afterSeq === undefined || seq > afterSeq) afterSeq = seq;
          }
          deliver(frame);
        }
        if (signal.aborted) return;
        throw new RemoteStreamCarrierError(
          "api gateway: Remote stream ended before cancellation",
        );
      } catch (error) {
        if (signal.aborted) return;
        if (!(error instanceof RemoteStreamCarrierError)) throw error;
        if (!this.autoReconnect) throw error;
        attempt += 1;
        const delay = Math.min(
          RECONNECT_INITIAL_MS * 2 ** (attempt - 1),
          RECONNECT_MAX_MS,
        );
        try {
          await wait(delay, signal);
        } catch {
          return;
        }
      } finally {
        await mux.close();
      }
    }
  }
}
