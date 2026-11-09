/**
 * Connector HTTP routes on the gateway host web server.
 *
 * Moves the Next.js route handlers for the connector list, Shopify, and
 * Business Profile endpoints onto the gateway's `webServer` listener. The
 * handlers keep the original request/response contracts:
 *
 * - authentication comes from the gateway's shared request-identity resolver
 *   (session cookie, `oh-user-id` identity cookie, then the anonymous headers
 *   or query), so a guest's OAuth callback and later reads agree on the user;
 * - every JSON envelope, status code, redirect, and "self-heal the stale
 *   `running` sync status" behaviour is preserved;
 * - the Shopify OAuth callback is intentionally NOT registered here. The
 *   `v1` Next route was only a re-export of `auth/shopify/callback`, and the
 *   auth routes plugin already owns both `/api/auth/shopify/callback` and the
 *   `/api/v1/integrations/shopify/callback` alias (including any
 *   `SHOPIFY_REDIRECT_URI` override). Registering it again would violate the
 *   web server's duplicate-route contract and abort gateway boot.
 *
 * Adaptations required by the node:http carrier:
 *
 * - `getAuthSessionFromRequest` is replaced by `../request-user`'s shared
 *   resolver, which the OAuth callbacks use as well.
 * - the callback derives its origin from the request `host` (honouring
 *   `x-forwarded-host` / `x-forwarded-proto`) instead of `req.nextUrl`.
 * - `require.resolve("india-pincode")` uses `node:module`'s `createRequire`
 *   because this plugin runs as ESM, not through the Next bundler.
 *
 * Register it after `WebServer` in the gateway composition root.
 *
 * @module @openai-harness/gateway/routes/connectors.shopify.plugin
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "@openai-harness/paths";
import zlib from "node:zlib";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Service, type Context } from "@deepseek-ai/cordis";
import type { WebRoute } from "@openai-harness/host-webserver";
import { executeBusinessProfileWorkflow } from "../workflows";
import { getRequestUser } from "../request-user";
import { applyCors } from "./cors";
import {
  fetchShopifyCollections,
  fetchShopifyProducts,
} from "@openai-harness/connector-shopify";
import {
  DEFAULT_BUSINESS_PROFILE_CRON_JOBS,
  deleteCronJobsByTypes,
} from "../cron";
import {
  disconnectConnectorBySlug,
  getConnectorByUserIdAndSlug,
  getConnectorsByUserId,
  requireConnectorRepository,
  upsertConnector,
  type Connector,
} from "@openai-harness/connector";
import { resolveSession } from "@openai-harness/session-persistence";
import { attachCollectedMedia } from "@openai-harness/tool-account";
import type { CompetitorProfileItem } from "@openai-harness/connector-business-profile";

const require = createRequire(import.meta.url);

/**
 * How long one Business Profile analysis may stay `running` before its row is
 * considered stale. The loader promises "up to 3 minutes"; 10 minutes leaves
 * generous headroom for slow scrapes while bounding the state a killed
 * process can strand.
 */
const BUSINESS_PROFILE_RUN_BUDGET_MS = 10 * 60 * 1000;

/** Recorded on a healed row when the interrupted run never saved a profile. */
const INTERRUPTED_ANALYSIS_ERROR =
  "Analysis was interrupted before it finished. Retry to rebuild the profile.";

/** Recorded when the caller cancelled the run before a profile was saved. */
const CANCELLED_ANALYSIS_ERROR =
  "Analysis was cancelled before it finished. Retry to rebuild the profile.";

/**
 * Runs started by this process, keyed by user id.
 *
 * This is the same in-process-registry idea the reference jobs package ships:
 * a run is owned by the process that started it and dies with it. Therefore a
 * persisted `running` row with no entry here is stale by definition, and a
 * recorded start older than {@link BUSINESS_PROFILE_RUN_BUDGET_MS} is stale
 * even when an entry still exists.
 */
interface BusinessProfileRun {
  /** Epoch milliseconds when this process started the run. */
  readonly startedAt: number;
  /** Cancels the workflow's agent turn (and every in-flight tool). */
  readonly controller: AbortController;
}

const businessProfileRuns = new Map<string, BusinessProfileRun>();

/**
 * Whether a stored `running` row has no live, in-budget run behind it.
 *
 * The durable `syncStartedAt` is preferred when present; the in-memory start
 * covers rows written before that field existed. A missing map entry is
 * always stale, which is what heals a row left behind by a process restart.
 */
function businessProfileRunIsStale(
  userId: string,
  connector: Pick<Connector, "syncStatus" | "syncStartedAt">,
): boolean {
  if (connector.syncStatus !== "running") return false;

  const run = businessProfileRuns.get(userId);
  if (run === undefined) return true;

  const recorded = connector.syncStartedAt
    ? Date.parse(connector.syncStartedAt)
    : Number.NaN;
  const startedAt = Number.isFinite(recorded) ? recorded : run.startedAt;
  return Date.now() - startedAt > BUSINESS_PROFILE_RUN_BUDGET_MS;
}

/**
 * Whether a Business Profile row should be terminalized on read.
 *
 * A saved profile means the analysis is over even if the flag was never
 * cleared; otherwise the row must have no live in-budget run.
 */
function businessProfileNeedsHeal(
  userId: string,
  connector: Connector,
): boolean {
  if (connector.syncStatus !== "running") return false;
  if (connector.status === "connected" && connector.metadata) return true;
  return businessProfileRunIsStale(userId, connector);
}

/**
 * Terminalize a stale Business Profile row.
 *
 * The persisted state, not the caller's poll, is the settlement: `idle` ends
 * the run, `connected` is kept when a profile exists, and a missing profile
 * carries a retryable error so the client renders its retry view instead of
 * the loader.
 */
async function healBusinessProfile(
  userId: string,
  connector: Connector,
): Promise<Connector> {
  if (businessProfileRunIsStale(userId, connector)) {
    const run = businessProfileRuns.get(userId);
    if (run !== undefined) {
      run.controller.abort(new Error("stale business-profile run"));
      businessProfileRuns.delete(userId);
    }
  }

  const hasProfile =
    connector.status === "connected" && Boolean(connector.metadata);
  const metadata = hasProfile
    ? connector.metadata
    : {
        ...(connector.metadata ?? {}),
        error: INTERRUPTED_ANALYSIS_ERROR,
      };

  const reset = await upsertConnector({
    userId,
    slug: "businessProfile",
    providerSlug: connector.providerSlug || "adsEasy",
    status: hasProfile ? "connected" : "disconnected",
    syncStatus: "idle",
    syncStartedAt: null,
    ...(hasProfile ? {} : { metadata }),
  });

  if (reset.success && reset.data) return reset.data;

  return {
    ...connector,
    status: hasProfile ? "connected" : "disconnected",
    syncStatus: "idle",
    syncStartedAt: undefined,
    metadata,
  };
}

/**
 * Terminalize every stale Business Profile row once, at gateway boot.
 *
 * A process that starts has no live runs, so any persisted `running` row is
 * left over from a process that died mid-run (this repository runs under
 * `tsx watch`, which restarts on every source edit). Failures are reported by
 * the caller; the per-request heal remains the safety net.
 *
 * @returns how many rows were healed.
 */
export async function sweepStaleBusinessProfileConnectors(): Promise<number> {
  const connectors = await requireConnectorRepository().listAll();
  let healed = 0;
  for (const connector of connectors) {
    if (connector.slug !== "businessProfile") continue;
    if (!businessProfileNeedsHeal(connector.userId, connector)) continue;
    await healBusinessProfile(connector.userId, connector);
    healed += 1;
  }
  return healed;
}

/** One node:http request handler. */
type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

/** Handlers keyed by the HTTP method they accept. */
type MethodHandlers = Partial<Record<"GET" | "POST" | "PATCH", RouteHandler>>;

/** Parse the request URL against a base so path-only node URLs work. */
function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://gateway.internal");
}

/** Buffer and parse a JSON request body (an empty body throws, as in Next). */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Send a JSON envelope with the same content type Next used. */
function sendJson(
  res: ServerResponse,
  status: number,
  value: unknown,
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(value));
}

/** Answer a path that was registered for other methods. */
function methodNotAllowed(res: ServerResponse, allowed: string[]): void {
  res.writeHead(405, {
    allow: allowed.join(", "),
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error: "Method Not Allowed" }));
}

/** Dispatch one path to its declared method handlers. */
function dispatch(handlers: MethodHandlers): RouteHandler {
  return async (req, res) => {
    // The browser UI runs on another origin in development; answer its
    // preflight and credentialled reads before method admission.
    if (!applyCors(req, res)) return;

    const method = (req.method ?? "GET") as keyof MethodHandlers;
    const handler = handlers[method];
    if (handler === undefined) {
      methodNotAllowed(res, Object.keys(handlers));
      return;
    }
    await handler(req, res);
  };
}

/** An error message using the original route's fallback text. */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Project one stored connector into the browser-facing DTO.
 *
 * Connector tokens live on the connector record so server tools can read them;
 * they must never cross the HTTP boundary. Every route that returns a
 * connector goes through this projection.
 */
function publicConnector<T extends {
  accessToken?: string | null;
  refreshToken?: string | null;
}>(connector: T): Omit<T, "accessToken" | "refreshToken"> {
  const { accessToken, refreshToken, ...rest } = connector;
  void accessToken;
  void refreshToken;
  return rest;
}

/**
 * Fill each competitor ad's media from the crawl that captured it.
 *
 * The model copies ad URLs reliably but drops the long signed CDN links, so a
 * stored profile can carry ads without `mediaUrls`. The crawler still has
 * them, keyed by ad library ID. This enriches the response only — the next
 * save persists the healed record.
 */
async function withCollectedMedia<T extends { metadata?: unknown }>(
  connector: T,
): Promise<T> {
  const metadata = (connector.metadata ?? null) as Record<string, unknown> | null;
  const competitorsBlock = metadata?.competitors as
    | { competitors?: CompetitorProfileItem[] }
    | undefined;
  const competitors = competitorsBlock?.competitors;
  if (!Array.isArray(competitors) || competitors.length === 0) return connector;
  try {
    return {
      ...connector,
      metadata: {
        ...metadata,
        competitors: {
          ...competitorsBlock,
          competitors: await attachCollectedMedia(competitors),
        },
      },
    };
  } catch {
    // The scraper store is optional here: the stored profile still renders.
    return connector;
  }
}

/**
 * GET /api/connectors
 * Returns every connector configuration and sync state for the user.
 */
const listConnectors: RouteHandler = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user?.id) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const connectorsRes = await getConnectorsByUserId(user.id);
    const connectors = connectorsRes.data ?? [];

    // Terminalize Business Profile rows whose run died with a previous
    // process, was cancelled, or overran its budget. Without this the client
    // polls a `running` flag forever and never leaves "Analyzing...".
    for (const connector of connectors) {
      if (connector.slug !== "businessProfile") continue;
      if (!businessProfileNeedsHeal(user.id, connector)) continue;
      Object.assign(connector, await healBusinessProfile(user.id, connector));
    }

    sendJson(res, 200, { connectors: connectors.map(publicConnector) });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * GET /api/connectors/shopify/collections
 * Fetches collections from the user's connected Shopify store.
 */
const listShopifyCollections: RouteHandler = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user?.id) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const { searchParams } = requestUrl(req);
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : 50;

    const result = await fetchShopifyCollections({
      context: {
        userId: user.id,
        providerSlug: "shopify",
      },
      params: { limit },
    });

    if (!result.success) {
      sendJson(
        res,
        result.error?.code === "AUTH_REQUIRED" ? 401 : 500,
        {
          error:
            result.error?.message || "Failed to fetch Shopify collections",
        },
      );
      return;
    }

    sendJson(res, 200, { collections: result.data || [] });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * GET /api/connectors/shopify/products
 * Fetches products from the user's connected Shopify store.
 */
const listShopifyProducts: RouteHandler = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user?.id) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const { searchParams } = requestUrl(req);
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : 10;
    const cursor = searchParams.get("cursor") || undefined;
    const query = searchParams.get("query") || undefined;
    const collectionId = searchParams.get("collectionId") || undefined;
    const status = (searchParams.get("status") || "ALL") as
      | "ACTIVE"
      | "DRAFT"
      | "ARCHIVED"
      | "ALL";

    const result = await fetchShopifyProducts({
      context: {
        userId: user.id,
        providerSlug: "shopify",
      },
      params: {
        limit,
        cursor,
        query,
        collectionId,
        status,
      },
    });

    if (!result.success) {
      sendJson(res, result.error?.code === "AUTH_REQUIRED" ? 401 : 500, {
        error: result.error?.message || "Failed to fetch Shopify products",
      });
      return;
    }

    sendJson(res, 200, result.data);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * POST /api/connectors/shopify/disconnect
 * Disconnects Shopify, cascades to Business Profile, and purges cron jobs.
 */
const disconnectShopify: RouteHandler = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user?.id) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const shopifyRes = await disconnectConnectorBySlug(user.id, "shopify");
    if (!shopifyRes.success) {
      sendJson(res, 500, {
        error: shopifyRes.error || "Failed to disconnect Shopify",
      });
      return;
    }

    await disconnectConnectorBySlug(user.id, "businessProfile");

    await deleteCronJobsByTypes(
      user.id,
      DEFAULT_BUSINESS_PROFILE_CRON_JOBS.map((job) => job.type),
    );

    sendJson(res, 200, {
      success: true,
      status: "disconnected",
      message:
        "Shopify, Business Profile, and associated automation jobs disconnected successfully",
    });
  } catch (error) {
    sendJson(res, 500, {
      error: errorMessage(
        error,
        "An unexpected error occurred during disconnect",
      ),
    });
  }
};

/** GET /api/connectors/business.profile */
const getBusinessProfile: RouteHandler = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user?.id) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const connectorRes = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
    );
    let connector = connectorRes.data ?? null;

    // Self-heal rows left in "running" by an earlier interrupted run. A saved
    // profile means the analysis is over, and a row with no live in-budget run
    // is stale by definition — without this the client can poll forever and
    // never leave the "Analyzing..." state.
    if (connector && businessProfileNeedsHeal(user.id, connector)) {
      connector = await healBusinessProfile(user.id, connector);
    }

    // Serve creative URLs the crawl captured, so profiles saved before the
    // lookup existed render media without waiting for a re-save.
    if (connector) connector = await withCollectedMedia(connector);

    sendJson(res, 200, {
      success: true,
      connector: connector ? publicConnector(connector) : null,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/** PATCH /api/connectors/business.profile */
const patchBusinessProfile: RouteHandler = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user?.id) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const body = (await readJson(req)) as {
      metadata?: Record<string, unknown>;
    };
    const { metadata } = body;

    const existingRes = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
    );
    const existing = existingRes.data;

    const updatedMetadata = {
      ...(existing?.metadata || {}),
      ...metadata,
    };

    const upsert = await upsertConnector({
      userId: user.id,
      slug: "businessProfile",
      providerSlug: "adsEasy",
      status: existing?.status || "connected",
      syncStatus: "idle",
      syncStartedAt: null,
      metadata: updatedMetadata,
    });

    sendJson(res, 200, {
      success: true,
      connector: upsert.data ? publicConnector(upsert.data) : null,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * POST /api/connectors/business.profile/connect
 * Resolves the analyzer session and runs the Business Profile AI workflow.
 */
const connectBusinessProfile: RouteHandler = async (req, res) => {
  const user = await getRequestUser(req);
  let activeRun: BusinessProfileRun | undefined;

  try {
    if (!user?.id) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const body = (await readJson(req)) as {
      url?: unknown;
      prompt?: unknown;
      input?: unknown;
    };
    const { url, prompt, input } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      sendJson(res, 400, { error: "Valid website URL is required" });
      return;
    }

    const sessionRes = await resolveSession({
      userId: user.id,
      slug: "businessProfile",
      title: "Business Profile Analyzer",
      reuse: true,
      hidden: true,
    });

    if (!sessionRes.success || !sessionRes.data) {
      sendJson(res, 500, {
        error: sessionRes.error || "Failed to resolve analyzer session",
      });
      return;
    }

    const session = sessionRes.data;
    const cleanUrl = url.trim();

    // Register this process's run before persisting `running`, so a row can
    // always be matched to a live run (or proven stale).
    const controller = new AbortController();
    activeRun = { startedAt: Date.now(), controller };
    businessProfileRuns.set(user.id, activeRun);

    // Closing the modal aborts the fetch. That is a cancellation: stop paying
    // for the run, and make the persisted state terminal so no other reader
    // keeps seeing `running`.
    const cancelOnClose = (): void => {
      if (!res.writableEnded) {
        controller.abort(new Error("client closed the connection"));
      }
    };
    res.once("close", cancelOnClose);

    let released = false;
    const releaseCloseListener = (): void => {
      if (released) return;
      released = true;
      res.off("close", cancelOnClose);
    };

    try {
      await upsertConnector({
        userId: user.id,
        slug: "businessProfile",
        providerSlug: "adsEasy",
        status: "disconnected",
        syncStatus: "running",
        syncStartedAt: new Date(activeRun.startedAt).toISOString(),
      });

      const workflow = executeBusinessProfileWorkflow({
        session,
        brandUrl: cleanUrl,
        input:
          typeof input === "string" && input.trim()
            ? input.trim()
            : typeof prompt === "string" && prompt.trim()
              ? prompt.trim()
              : undefined,
        signal: controller.signal,
      });
      // A cancelled run is detached from this request and may reject after the
      // race below has already settled; never let that become unhandled.
      void workflow.catch(() => {});

      const cancelled = new Promise<void>((resolve) => {
        if (controller.signal.aborted) {
          resolve();
          return;
        }
        controller.signal.addEventListener("abort", () => resolve(), {
          once: true,
        });
      });

      // Stop waiting on the run as soon as its caller is gone. The workflow
      // itself observes the same signal and cancels its agent turn.
      await Promise.race([workflow, cancelled]);
    } finally {
      releaseCloseListener();
      if (businessProfileRuns.get(user.id) === activeRun) {
        businessProfileRuns.delete(user.id);
      }
    }

    const wasCancelled = controller.signal.aborted;

    // The run is over (or was cancelled): always clear the "running" flag,
    // otherwise the client polls forever and the UI stays on "Analyzing...".
    const connectorRes = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
    );
    const connector = connectorRes.success ? connectorRes.data : null;
    const isAnalyzed =
      connector?.status === "connected" && Boolean(connector.metadata);

    await upsertConnector({
      userId: user.id,
      slug: "businessProfile",
      providerSlug: "adsEasy",
      status: isAnalyzed ? "connected" : "disconnected",
      syncStatus: "idle",
      syncStartedAt: null,
      ...(wasCancelled && !isAnalyzed
        ? {
            metadata: {
              ...(connector?.metadata ?? {}),
              error: CANCELLED_ANALYSIS_ERROR,
            },
          }
        : {}),
    });

    if (wasCancelled) {
      // The requester closed the connection; there is nobody to answer.
      return;
    }

    // The caller may have vanished between the run settling and this write;
    // the durable terminal state above is what matters in that case.
    if (res.writableEnded || res.destroyed) return;

    if (!isAnalyzed) {
      sendJson(res, 500, {
        error: "Analysis finished without saving a business profile.",
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      connector: connector
        ? publicConnector({
            ...connector,
            status: "connected",
            syncStatus: "idle",
          })
        : null,
    });
  } catch (error) {
    const wasCancelled = activeRun?.controller.signal.aborted ?? false;
    const message = wasCancelled
      ? CANCELLED_ANALYSIS_ERROR
      : errorMessage(error, "Failed to connect business profile");

    if (user?.id) {
      try {
        const existing = await getConnectorByUserIdAndSlug(
          user.id,
          "businessProfile",
        );
        // Never wipe a profile the workflow already saved: only record the
        // error when there is no connected profile to fall back to.
        const hasProfile =
          existing.data?.status === "connected" &&
          Boolean(existing.data.metadata);

        await upsertConnector({
          userId: user.id,
          slug: "businessProfile",
          providerSlug: "adsEasy",
          status: hasProfile ? "connected" : "disconnected",
          syncStatus: "idle",
          syncStartedAt: null,
          ...(hasProfile ? {} : { metadata: { error: message } }),
        });
      } catch (dbError) {
        console.error("Failed to reset connector syncStatus:", dbError);
      }
    }

    if (!wasCancelled && !res.writableEnded && !res.destroyed) {
      sendJson(res, 500, { error: message });
    }
  } finally {
    if (
      user?.id &&
      activeRun !== undefined &&
      businessProfileRuns.get(user.id) === activeRun
    ) {
      businessProfileRuns.delete(user.id);
    }
  }
};

/** POST /api/connectors/business.profile/disconnect */
const disconnectBusinessProfile: RouteHandler = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user?.id) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const disconnect = await disconnectConnectorBySlug(
      user.id,
      "businessProfile",
    );
    if (!disconnect.success) {
      sendJson(res, 500, {
        error: disconnect.error || "Failed to disconnect Business Profile",
      });
      return;
    }

    await deleteCronJobsByTypes(
      user.id,
      DEFAULT_BUSINESS_PROFILE_CRON_JOBS.map((job) => job.type),
    );

    sendJson(res, 200, {
      success: true,
      status: "disconnected",
      message:
        "Business Profile and associated automation jobs disconnected successfully",
    });
  } catch (error) {
    sendJson(res, 500, {
      error: errorMessage(
        error,
        "Failed to disconnect Business Profile connector",
      ),
    });
  }
};

/** India postal dataset record, unchanged from the Next route. */
interface PostalRecord {
  c?: string;
  r?: string;
  v?: string;
  o?: string;
  p?: string;
  t?: string;
  d?: number;
  i?: string;
  s?: string;
}

let cachedRecords: PostalRecord[] | null = null;

/** Locate and load the India pincode dataset, resolving from this ESM file. */
function loadPostalRecords(): PostalRecord[] {
  if (cachedRecords) return cachedRecords;

  const candidatePaths = [
    (() => {
      try {
        return path.resolve(
          path.dirname(require.resolve("india-pincode")),
          "..",
          "data",
          "pincodes.json.gz",
        );
      } catch {
        return null;
      }
    })(),
    path.join(
      PROJECT_ROOT,
      "node_modules/india-pincode/data/pincodes.json.gz",
    ),
    (() => {
      try {
        return path.resolve(
          path.dirname(require.resolve("india-pincode")),
          "..",
          "data",
          "pincodes.json",
        );
      } catch {
        return null;
      }
    })(),
    path.join(PROJECT_ROOT, "node_modules/india-pincode/data/pincodes.json"),
  ].filter(Boolean) as string[];

  let loaded: PostalRecord[] | null = null;

  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    if (filePath.endsWith(".gz")) {
      const compressed = fs.readFileSync(filePath);
      const decompressed = zlib.gunzipSync(compressed);
      loaded = JSON.parse(decompressed.toString("utf-8"));
      break;
    }
    loaded = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    break;
  }

  if (!loaded || !Array.isArray(loaded)) {
    throw new Error(
      "India postal dataset could not be located in candidate paths.",
    );
  }

  cachedRecords = loaded;
  return cachedRecords;
}

const ALIAS_MAP: Record<string, string[]> = {
  bangalore: ["bengaluru", "bangalore"],
  bengaluru: ["bengaluru", "bangalore"],
  "bangalore urban": ["bengaluru urban", "bangalore urban"],
  "bangalore rural": ["bengaluru rural", "bangalore rural"],
  "bengaluru urban": ["bengaluru urban", "bangalore urban"],
  "bengaluru rural": ["bengaluru rural", "bangalore rural"],
  calcutta: ["kolkata", "calcutta"],
  kolkata: ["kolkata", "calcutta"],
  madras: ["chennai", "madras"],
  chennai: ["chennai", "madras"],
  bombay: ["mumbai", "bombay"],
  mumbai: ["mumbai", "mumbai city", "mumbai suburban"],
  "mumbai city": ["mumbai city", "mumbai"],
  "mumbai suburban": ["mumbai suburban", "mumbai"],
  mysore: ["mysuru", "mysore"],
  mysuru: ["mysuru", "mysore"],
  gurgaon: ["gurugram", "gurgaon"],
  gurugram: ["gurugram", "gurgaon"],
  pondicherry: ["puducherry", "pondicherry"],
  puducherry: ["puducherry", "pondicherry"],
  poona: ["pune", "poona"],
  pune: ["pune", "poona"],
  baroda: ["vadodara", "baroda"],
  vadodara: ["vadodara", "baroda"],
  cochin: ["ernakulam", "kochi", "cochin"],
  kochi: ["ernakulam", "kochi", "cochin"],
  trivandrum: ["thiruvananthapuram", "trivandrum"],
  thiruvananthapuram: ["thiruvananthapuram", "trivandrum"],
  belgaum: ["belagavi", "belgaum"],
  belagavi: ["belagavi", "belgaum"],
  bellary: ["ballari", "bellary"],
  ballari: ["ballari", "bellary"],
  hubli: ["dharwad", "hubli", "hubballi"],
  hubballi: ["dharwad", "hubli", "hubballi"],
  mangalore: ["dakshina kannada", "mangalore", "mangaluru"],
  mangaluru: ["dakshina kannada", "mangalore", "mangaluru"],
  shimoga: ["shivamogga", "shimoga"],
  shivamogga: ["shivamogga", "shimoga"],
  bijapur: ["vijayapura", "bijapur"],
  vijayapura: ["vijayapura", "bijapur"],
  gulbarga: ["kalaburagi", "gulbarga"],
  kalaburagi: ["kalaburagi", "gulbarga"],
};

/** Trim the locality suffixes the postal dataset appends. */
function cleanArea(rawArea: string): string {
  if (!rawArea) return "";
  return rawArea
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+[BSH]\.O\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** GET /api/connectors/business.profile/areas?city=&state= */
const businessProfileAreas: RouteHandler = async (req, res) => {
  const { searchParams } = requestUrl(req);
  const city = searchParams.get("city") || "";
  const state = searchParams.get("state") || "";

  if (!city.trim()) {
    sendJson(res, 200, { success: true, areas: [] });
    return;
  }

  try {
    const records = loadPostalRecords();
    const normCity = city.trim().toLowerCase();
    const normState = state ? state.trim().toLowerCase() : "";

    const targets = (ALIAS_MAP[normCity] || [normCity]).map((target) =>
      target.toLowerCase(),
    );

    const executeFilter = (applyState: boolean) => {
      const areaSet = new Set<string>();

      for (const item of records) {
        if (!item.o || !item.i || item.i === "NA") continue;

        if (applyState && normState && item.s && item.s !== "NA") {
          const itemState = item.s.toLowerCase();
          if (
            itemState !== normState &&
            !itemState.includes(normState) &&
            !normState.includes(itemState)
          ) {
            continue;
          }
        }

        const dist = item.i.toLowerCase().trim();
        const isMatch = targets.some((target) => {
          if (dist === target) return true;
          if (
            dist === target + " district" ||
            target === dist + " district"
          ) {
            return true;
          }
          if (dist.startsWith(target + " ") || dist.endsWith(" " + target)) {
            return true;
          }
          return false;
        });

        if (isMatch) {
          const cleaned = cleanArea(item.o);
          if (cleaned) areaSet.add(cleaned);
        }
      }

      return Array.from(areaSet).sort((a, b) => a.localeCompare(b));
    };

    let results = executeFilter(true);
    if (results.length === 0 && normState) {
      results = executeFilter(false);
    }

    if (results.length === 0) {
      const fallbackSet = new Set<string>();
      for (const item of records) {
        if (!item.o || item.o === "NA") continue;
        const cleaned = cleanArea(item.o);
        if (
          cleaned.toLowerCase().includes(normCity) ||
          normCity.includes(cleaned.toLowerCase())
        ) {
          fallbackSet.add(cleaned);
        }
      }
      results = Array.from(fallbackSet).sort((a, b) => a.localeCompare(b));
    }

    sendJson(res, 200, { success: true, areas: results });
  } catch (error) {
    sendJson(res, 500, { success: false, areas: [], error: String(error) });
  }
};

/** Every route this plugin owns. */
const ROUTES: readonly WebRoute[] = [
  {
    kind: "exact",
    path: "/api/connectors",
    handler: dispatch({ GET: listConnectors }),
  },
  {
    kind: "exact",
    path: "/api/connectors/shopify/collections",
    handler: dispatch({ GET: listShopifyCollections }),
  },
  {
    kind: "exact",
    path: "/api/connectors/shopify/products",
    handler: dispatch({ GET: listShopifyProducts }),
  },
  {
    kind: "exact",
    path: "/api/connectors/shopify/disconnect",
    handler: dispatch({ POST: disconnectShopify }),
  },
  {
    kind: "exact",
    path: "/api/connectors/business.profile",
    handler: dispatch({
      GET: getBusinessProfile,
      PATCH: patchBusinessProfile,
    }),
  },
  {
    kind: "exact",
    path: "/api/connectors/business.profile/connect",
    handler: dispatch({ POST: connectBusinessProfile }),
  },
  {
    kind: "exact",
    path: "/api/connectors/business.profile/disconnect",
    handler: dispatch({ POST: disconnectBusinessProfile }),
  },
  {
    kind: "exact",
    path: "/api/connectors/business.profile/areas",
    handler: dispatch({ GET: businessProfileAreas }),
  },
];

/**
 * Connector routes as a Cordis service on the gateway web server.
 *
 * `webServer` is a static dependency, so the constructor runs only after the
 * listener service has activated, and every route registration is owned by
 * this fiber's effect scope.
 */
export class ConnectorsShopifyService extends Service {
  static inject = ["webServer"];

  constructor(ctx: Context) {
    super(ctx, "connectorsShopify");

    ctx.effect(() => {
      const disposers = ROUTES.map((route) => ctx.webServer.register(route));
      return () => {
        for (const dispose of disposers.reverse()) dispose();
      };
    }, "connectors-shopify: routes");
  }
}

export default ConnectorsShopifyService;
