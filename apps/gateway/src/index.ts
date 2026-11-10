/**
 * Gateway composition root.
 *
 * Mirrors the composition half of `packages/boot/app-boot` in the reference
 * deepseek-harness repository: a root Cordis `Context`, one plugin load per
 * Host service, and root-fiber disposal as the only shutdown path. This app
 * owns no transport, storage, or session code — the Remote stream mux lives in
 * `@openai-harness/api-gateway`, the Session commands and follow stream in
 * `@openai-harness/session-controller`, the HTTP carrier in
 * `@openai-harness/client-connection`, the listener in
 * `@openai-harness/host-webserver`, storage in the `storage-*` packages, and
 * every product tool in its own `tool-*` package.
 *
 * The flat modules beside this file (`tools`, `skills`, `llm`, `agent-loop`,
 * `workflows`, `schedule`, `persistence`, `auth`, `session-sources`) bind the
 * deployment facts those packages deliberately do not own.
 *
 * @module @openai-harness/gateway
 */

// Must stay first: loads .env before any module reads environment variables.
import "./env";

import { Context } from "@deepseek-ai/cordis";
import TypertGatewayService from "@openai-harness/api-gateway";
import HostConnectionService from "@openai-harness/client-connection";
import { businessProfileConnectorProvider } from "@openai-harness/connector-business-profile";
import { metaConnectorProvider } from "@openai-harness/connector-meta";
import { shopifyConnectorProvider } from "@openai-harness/connector-shopify";
import { ConnectorService } from "@openai-harness/connector";
import {
  WebServer,
  type WebServerConfig,
} from "@openai-harness/host-webserver";
import { dataPath } from "@openai-harness/paths";
import * as Scraper from "@openai-harness/scraper";
import SessionController from "@openai-harness/session-controller";
import Storage from "@openai-harness/storage";
import * as storageDomain from "@openai-harness/storage-domain";
import * as storageJson from "@openai-harness/storage-json";
import { configureAgentLoopHost } from "./agent-loop";
import { BrowserAuthService } from "./auth";
import {
  SessionAgentSource,
  SessionFollowSource,
} from "./session-sources";
import * as persistence from "./persistence";
import AttachmentsRoutes from "./routes/attachments.plugin";
import AuthRoutes from "./routes/auth.plugin";
import ConnectorsMetaService from "./routes/connectors.meta.plugin";
import ConnectorsShopifyService, {
  sweepStaleBusinessProfileConnectors,
} from "./routes/connectors.shopify.plugin";
import CronRoutes from "./routes/cron.plugin";
import * as schedule from "./schedule";
import * as tools from "./tools";
import { configureWorkflowHost } from "./workflows";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4_000;
const DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173";

/** Read the concrete bind address; the webserver rejects wildcard binds. */
function readHost(): string {
  return process.env.GATEWAY_HOST?.trim() || DEFAULT_HOST;
}

/** Read the listen port, exiting on a malformed value. */
function readPort(): number {
  const raw = process.env.GATEWAY_PORT;
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    console.error(`[gateway] invalid GATEWAY_PORT: ${raw}`);
    process.exit(1);
  }
  return port;
}

/** Read the browser origins allowed to call the gateway. */
function readAllowedOrigins(): string[] {
  const raw = process.env.GATEWAY_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Compose and start the gateway.
 * @returns the live root context, after every plugin entry has settled.
 * @throws when a plugin fails to configure or start; the partial tree is disposed.
 */
async function boot(): Promise<Context> {
  const ctx = new Context();
  const webConfig: WebServerConfig = {
    host: readHost(),
    port: readPort(),
  };
  try {
    await ctx.plugin(WebServer, webConfig);

    // Storage hub → JSON backend → domain facility. Every stateful package
    // (sessions projections, connectors, schedule) opens its domain here.
    await ctx.plugin(Storage);
    await ctx.plugin(storageJson, { root: dataPath("storage") });
    await ctx.plugin(storageDomain, { backend: "json" });

    // The Meta Ad Library pipeline owns the `scraper` domain and binds its
    // repository for the tool packages. Without this mount every ad read and
    // write fails with "no repository", so searches silently deliver zero ads.
    await ctx.plugin(Scraper);

    await ctx.plugin(persistence);
    configureAgentLoopHost();
    configureWorkflowHost();

    await ctx.plugin(tools);

    await ctx.plugin(ConnectorService);
    ctx.connectors.registerProvider(metaConnectorProvider);
    ctx.connectors.registerProvider(shopifyConnectorProvider);
    ctx.connectors.registerProvider(businessProfileConnectorProvider);

    await ctx.plugin(schedule);

    await ctx.plugin(BrowserAuthService);
    await ctx.plugin(SessionFollowSource);
    await ctx.plugin(SessionAgentSource);
    await ctx.plugin(HostConnectionService, {
      allowedOrigins: readAllowedOrigins(),
    });
    await ctx.plugin(SessionController);
    await ctx.plugin(TypertGatewayService);
    await ctx.plugin(AttachmentsRoutes);
    await ctx.plugin(AuthRoutes);
    await ctx.plugin(ConnectorsMetaService);
    await ctx.plugin(ConnectorsShopifyService);
    await ctx.plugin(CronRoutes);

    // A fresh process owns no runs, so any persisted `running` Business
    // Profile analysis was left behind by a process that died mid-run. Heal
    // it once here (the per-request heal stays as the safety net) so a restart
    // never leaves a client polling forever.
    try {
      const healed = await sweepStaleBusinessProfileConnectors();
      if (healed > 0) {
        console.log(
          `[gateway] terminalized ${String(healed)} stale business-profile run(s)`,
        );
      }
    } catch (error) {
      console.warn(
        `[gateway] business-profile stale sweep skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    ctx.effect(() => {
      return ctx.webServer.register({
        kind: "exact",
        path: "/health",
        handler: (_req, res) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        },
      });
    }, "gateway: /health route");

    return ctx;
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }
}

const ctx = await boot();
const address = `${ctx.webServer.host}:${String(ctx.webServer.port ?? 0)}`;
console.log(
  `[gateway] listening on ${address} (health GET /health, rpc POST /api/session/<method>, stream ws /api/remote.mux)`,
);

let shuttingDown = false;

/**
 * Dispose the whole tree once. Cordis runs every effect disposer in reverse
 * registration order, so the mux closes before the listener it upgrades from.
 * @param signal - process signal that requested shutdown.
 */
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[gateway] ${signal} received, shutting down`);
  void ctx.fiber.dispose().then(
    () => {
      process.exit(0);
    },
    (error: unknown) => {
      console.error("[gateway] shutdown failed", error);
      process.exit(1);
    },
  );
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
