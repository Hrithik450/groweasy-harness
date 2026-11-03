/**
 * node:http route and HTTP-upgrade registration.
 *
 * Ported from `packages/host/webserver/src/index.ts` in the reference
 * deepseek-harness repository. The service, route tables, longest-prefix
 * matching, upgraded-socket tracking and the listen/dispose effect are kept
 * verbatim; only the parts this gateway does not serve are omitted:
 *
 * - static-dist serving, the fallback seat, index injection and gzip
 *   compression belong to the browser application host, not this gateway;
 * - TLS material loading (`tls`) and `appReady` gating are not used by the
 *   gateway deployment;
 * - the `ipaddr.js` bind-address parser is replaced by a small `node:net`
 *   based literal check because this repository does not depend on ipaddr.js.
 *   Wildcard addresses are still rejected before the listener binds.
 *
 * @module @openai-harness/host-webserver
 */

import { createServer } from "node:http";
import type {
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import { isIP, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { Context, Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

declare module "@deepseek-ai/cordis" {
  interface Context {
    webServer: WebServer;
  }
}

/** Route match kind: `exact` matches the pathname verbatim; `prefix` p matches p and p/<anything>. */
export type WebRouteKind = "exact" | "prefix";

/** One named route registration. */
export interface WebRoute {
  kind: WebRouteKind;
  /** Absolute pathname, no trailing slash. */
  path: string;
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void | Promise<void>;
}

/** One exact-path HTTP upgrade registration. */
export interface WebUpgradeRoute {
  /** Absolute pathname, no trailing slash. */
  path: string;
  /** Owns protocol negotiation and the upgraded socket after dispatch. */
  handler: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void | Promise<void>;
}

/** Listen configuration. The host must be a concrete interface address. */
export interface WebServerConfig {
  /** Concrete IPv4 or IPv6 literal of one local interface. */
  host: string;
  /** Listen port; zero requests an OS-assigned port. */
  port: number;
}

const IPV4_TAIL = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Expand a dotted-quad tail to the two hexadecimal groups holding the same
 * bytes, so an IPv6 literal can be compared group by group.
 */
function withHexTail(host: string): string {
  const tail = IPV4_TAIL.exec(host);
  if (tail === null) return host;
  const [, head = "", a = "", b = "", c = "", d = ""] = tail;
  const high = ((Number(a) << 8) | Number(b)).toString(16);
  const low = ((Number(c) << 8) | Number(d)).toString(16);
  return `${head}${high}:${low}`;
}

/** Whether a concrete IPv4/IPv6 literal writes the unspecified address. */
function isWildcardAddress(host: string): boolean {
  const kind = isIP(host);
  if (kind === 4) {
    return host.split(".").every((part) => Number(part) === 0);
  }
  if (kind !== 6) {
    throw new Error(
      `webserver: host ${JSON.stringify(host)} is not a concrete IPv4 or IPv6 address literal`,
    );
  }
  const zoneAt = host.indexOf("%");
  const bare = withHexTail(zoneAt === -1 ? host : host.slice(0, zoneAt));
  const halves = bare.split("::");
  if (halves.length > 2) {
    throw new Error(
      `webserver: host ${JSON.stringify(host)} is not a concrete IPv4 or IPv6 address literal`,
    );
  }
  const left = halves[0] === "" ? [] : (halves[0] ?? "").split(":");
  const right =
    halves.length === 2 && halves[1] !== ""
      ? (halves[1] ?? "").split(":")
      : [];
  const missing = 8 - left.length - right.length;
  const groups = [
    ...left,
    ...(halves.length === 2 ? new Array<string>(Math.max(0, missing)).fill("0") : []),
    ...right,
  ];
  return groups.every((group) => Number.parseInt(group, 16) === 0);
}

/**
 * The browser HTTP carrier service. Activation listens immediately; a bind
 * failure rejects initialization. Named routes must be distinct, and an
 * unmatched request answers 404.
 */
export class WebServer extends Service {
  static Config: z<WebServerConfig> = z.object({
    host: z
      .transform(z.string(), (value) => {
        if (isIP(value) === 0) {
          throw new Error(
            `webserver: host ${JSON.stringify(value)} is not a concrete IPv4 or IPv6 address literal`,
          );
        }
        if (isWildcardAddress(value)) {
          throw new Error(
            `webserver: host ${JSON.stringify(value)} is an unspecified (wildcard) address, which is not supported: bind one concrete IPv4 or IPv6 address of a local interface instead`,
          );
        }
        return value;
      })
      .required(),
    port: z.natural().max(65_535).required(),
  });

  private readonly exact = new Map<string, WebRoute>();
  private readonly prefixes = new Map<string, WebRoute>();
  private readonly upgrades = new Map<string, WebUpgradeRoute>();
  private readonly upgradedSockets = new Set<Duplex>();
  private server!: Server;
  private listenedPort: number | undefined;

  constructor(
    ctx: Context,
    private readonly config: WebServerConfig,
  ) {
    super(ctx, "webServer");
    if (isWildcardAddress(config.host)) {
      throw new Error(
        `webserver: host ${JSON.stringify(config.host)} is an unspecified (wildcard) address, which is not supported: bind one concrete IPv4 or IPv6 address of a local interface instead`,
      );
    }
  }

  /** The listening port (the OS-assigned value when config.port is 0), or `undefined` before `listen` binds. */
  get port(): number | undefined {
    return this.listenedPort;
  }

  /** The configured bind address (one concrete local interface). */
  get host(): string {
    return this.config.host;
  }

  /** The protocol this listener speaks. TLS is not part of the gateway host. */
  get protocol(): "http:" {
    return "http:";
  }

  /**
   * Register a named route. Duplicate (kind, path) throws — route patterns are
   * a composition-level contract, so a collision is a misconfiguration.
   * @param route - kind, path, and the owning handler.
   * @returns the disposer removing the route.
   */
  register(route: WebRoute): () => void {
    const table = route.kind === "exact" ? this.exact : this.prefixes;
    if (table.has(route.path)) {
      throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
    }
    table.set(route.path, route);
    return () => {
      table.delete(route.path);
    };
  }

  /**
   * Register an exact-path HTTP upgrade route. Duplicate paths throw because
   * one socket can have only one protocol owner.
   * @param route - pathname and handler owning negotiation plus socket use.
   * @returns the disposer removing the route.
   */
  registerUpgrade(route: WebUpgradeRoute): () => void {
    if (this.upgrades.has(route.path)) {
      throw new Error(`webserver: duplicate upgrade route "${route.path}"`);
    }
    this.upgrades.set(route.path, route);
    return () => {
      this.upgrades.delete(route.path);
    };
  }

  /** Listen; resolves once the socket is bound (rejection = FAILED fiber). */
  async [Service.init](): Promise<void> {
    const handle = async (
      req: IncomingMessage,
      res: ServerResponse,
    ): Promise<void> => {
      const rawPath = new URL(req.url ?? "/", "http://x").pathname;
      const route = this.match(rawPath);
      if (route !== undefined) {
        await route.handler(req, res);
        return;
      }
      res.writeHead(404);
      res.end();
    };
    // Last-resort guard: a rejected handler must answer (or destroy) this
    // request instead of becoming an unhandled rejection that kills the process.
    const listener = (req: IncomingMessage, res: ServerResponse): void => {
      void handle(req, res).catch((err: unknown) => {
        this.ctx.logger.warn(err instanceof Error ? err : new Error(String(err)));
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.writeHead(400);
        res.end();
      });
    };

    await this.ctx.effect(async () => {
      this.server = createServer(listener);
      this.server.on("upgrade", (req, socket, head) => {
        const onError = (error: Error): void => {
          this.ctx.logger.warn(error);
          socket.destroy();
        };
        socket.on("error", onError);
        socket.once("close", () => {
          socket.off("error", onError);
          this.upgradedSockets.delete(socket);
        });
        let route: WebUpgradeRoute | undefined;
        try {
          route = this.upgrades.get(new URL(req.url ?? "/", "http://x").pathname);
        } catch (error) {
          this.ctx.logger.warn(
            error instanceof Error ? error : new Error(String(error)),
          );
          socket.destroy();
          return;
        }
        if (route === undefined) {
          socket.destroy();
          return;
        }
        this.upgradedSockets.add(socket);
        try {
          Promise.resolve(route.handler(req, socket, head)).catch(
            (error: unknown) => {
              this.ctx.logger.warn(
                error instanceof Error ? error : new Error(String(error)),
              );
              socket.destroy();
            },
          );
        } catch (error) {
          this.ctx.logger.warn(
            error instanceof Error ? error : new Error(String(error)),
          );
          socket.destroy();
        }
      });

      await new Promise<void>((resolve, reject) => {
        this.server.once("error", reject);
        this.server.listen(this.config.port, this.config.host, () => {
          this.server.off("error", reject);
          this.server.on("error", (err) => {
            this.ctx.logger.error(err);
          });
          this.listenedPort = (this.server.address() as AddressInfo).port;
          resolve();
        });
      });

      // Node does not include upgraded sockets in closeAllConnections(), so the
      // service tracks and destroys them explicitly during disposal.
      return async () => {
        const serverClosed = new Promise<void>((resolve) => {
          this.server.close(() => {
            resolve();
          });
        });
        this.server.closeAllConnections();
        const socketsClosed = [...this.upgradedSockets].map(
          (socket) =>
            new Promise<void>((resolve) => {
              socket.once("close", () => {
                resolve();
              });
              socket.destroy();
            }),
        );
        await Promise.all([serverClosed, ...socketsClosed]);
      };
    }, "webServer.listen");
  }

  /** Longest-prefix-wins over the prefix table after an exact-table miss. */
  private match(pathname: string): WebRoute | undefined {
    const exact = this.exact.get(pathname);
    if (exact !== undefined) return exact;
    let best: WebRoute | undefined;
    for (const [prefix, route] of this.prefixes) {
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
      if (best === undefined || prefix.length > best.path.length) best = route;
    }
    return best;
  }
}

export default WebServer;
