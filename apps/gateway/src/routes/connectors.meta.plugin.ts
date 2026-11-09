/**
 * Meta connector HTTP routes on the gateway host web server.
 *
 * This is a direct port of the Next App Router handlers that used to live under
 * `src/app/api/connectors/meta/**`. Every path, method, authentication rule,
 * validation message, upstream call and response body is preserved; only the
 * transport shell changed:
 *
 * - `NextRequest` / `NextResponse` are replaced by `node:http` request/response
 *   objects plus a WHATWG {@link Request} built from the incoming message, so
 *   the handler code can keep using `request.json()` / `request.formData()`.
 * - `getAuthSessionFromRequest` (which imported `next/headers` through
 *   `@/lib/auth/session`) is replaced by the gateway's shared request-identity
 *   resolver: verified session cookie, `oh-user-id` identity cookie, then the
 *   `x-user-id` / `x-anonymous-user-id` headers or query.
 * - Routes are registered as exact `webServer` routes, so they take precedence
 *   over the shared `/api` prefix route owned by `@openai-harness/client-connection`.
 *
 * The Meta Graph API client itself stays in `@/lib/connectors/meta`; this file
 * only adapts HTTP to it.
 *
 * @module @openai-harness/gateway
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { Context, Service } from "@deepseek-ai/cordis";
import { getRequestUser } from "../request-user";
import { applyCors } from "./cors";
import {
  getConnectorByUserIdAndSlug,
  getConnectorByUserIdAndProviderSlug,
  disconnectConnectorBySlug,
  upsertConnector,
} from "@openai-harness/connector";
import {
  DEFAULT_META_CRON_JOBS,
  deleteCronJobsByTypes,
} from "../cron";
import {
  fetchMetaAdAccounts,
  fetchMetaCampaigns,
  createMetaCampaign,
  updateMetaCampaign,
  deleteMetaCampaign,
  fetchMetaAdSets,
  createMetaAdSet,
  updateMetaAdSet,
  deleteMetaAdSet,
  fetchMetaAds,
  uploadImageCreative,
  uploadVideoCreative,
  type MetaCampaignStatus,
} from "@openai-harness/connector-meta";

/** Method set the original route files exported. */
type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** One JSON response produced by a route handler. */
interface RouteResult {
  readonly status: number;
  readonly body: unknown;
}

/** Route handler after authentication; `userId` is the resolved session user. */
type RouteHandler = (
  request: Request,
  userId: string,
) => Promise<RouteResult>;

/**
 * Parsed JSON body. The Next handlers read `await req.json()` as `any`; this
 * alias keeps that behaviour explicit in one place.
 */
 
type JsonObject = Record<string, any>;

const BASE_PATH = "/api/connectors/meta" as const;

/** `Error#message` for the generic 500 envelopes. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Write one JSON response with the same body shape `NextResponse.json` produced. */
function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Resolve the authenticated user through the gateway's shared request
 * identity resolver: verified session cookie, then the browser identity
 * cookie, then the anonymous headers/query. Every failure is a 401, never a
 * 500.
 */
async function resolveUserId(req: IncomingMessage): Promise<string | null> {
  try {
    return (await getRequestUser(req))?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Build a Fetch `Request` over the live node request. Bodies are streamed, so
 * multipart creative uploads are not buffered twice; `duplex: "half"` is the
 * Node requirement for a streaming request body.
 */
function toFetchRequest(req: IncomingMessage): Request {
  const url = new URL(req.url ?? "/", "http://gateway.internal");
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  return new Request(url, {
    method,
    headers,
    body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

/* -------------------------------------------------------------------------- */
/* Handlers — ported one-for-one from the deleted Next route files.            */
/* -------------------------------------------------------------------------- */

/** POST /api/connectors/meta/connect */
async function handleConnect(
  _request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const connectorRes = await getConnectorByUserIdAndSlug(userId, "metaAds");
    const connector = connectorRes?.data;
    if (!connector || connector.status !== "connected") {
      return {
        status: 400,
        body: { error: "Meta Ads connector is not connected" },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: "Meta Ads connector confirmed connected",
      },
    };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** POST /api/connectors/meta/disconnect */
async function handleDisconnect(
  _request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const result = await disconnectConnectorBySlug(userId, "metaAds");
    if (!result.success) {
      return {
        status: 500,
        body: { error: result.error || "Failed to disconnect Meta Ads" },
      };
    }

    await deleteCronJobsByTypes(
      userId,
      DEFAULT_META_CRON_JOBS.map((job) => job.type),
    );

    return {
      status: 200,
      body: {
        success: true,
        status: "disconnected",
        message:
          "Meta Ads Manager and associated cron jobs disconnected successfully",
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during disconnect",
      },
    };
  }
}

/** GET /api/connectors/meta/ad-accounts */
async function handleListAdAccounts(
  _request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const token = connectorRes?.data?.accessToken;
    if (!token) {
      return {
        status: 400,
        body: {
          error: "Meta Ads connector is not connected. Missing access token.",
        },
      };
    }

    const res = await fetchMetaAdAccounts(token);
    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to fetch ad accounts" },
      };
    }

    return {
      status: 200,
      body: { success: true, adAccounts: res.data || [] },
    };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** POST /api/connectors/meta/ad-accounts */
async function handleSyncAdAccounts(
  _request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = connector?.accessToken;
    if (!token || !connector) {
      return {
        status: 400,
        body: {
          error: "Meta Ads connector is not connected. Missing access token.",
        },
      };
    }

    const res = await fetchMetaAdAccounts(token);
    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to fetch ad accounts" },
      };
    }

    const adAccounts = res.data || [];
    const currentMeta =
      (connector.metadata as Record<string, unknown>) || {};

    await upsertConnector({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      status: "connected",
      accessToken: token,
      metadata: {
        ...currentMeta,
        adAccounts,
        syncedAt: new Date().toISOString(),
      },
    });

    return { status: 200, body: { success: true, adAccounts } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** GET /api/connectors/meta/ad-accounts/campaigns */
async function handleListCampaigns(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get("adAccountId");
    const statusFilter = searchParams.get("statusFilter") ?? undefined;
    const limit = searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined;

    if (!adAccountId) {
      return {
        status: 400,
        body: { error: "adAccountId query parameter is required" },
      };
    }

    const res = await fetchMetaCampaigns({
      params: {
        adAccountId,
        statusFilter: statusFilter as
          | MetaCampaignStatus
          | "ALL"
          | undefined,
        limit,
      },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to fetch campaigns" },
      };
    }

    return { status: 200, body: { success: true, data: res.data || [] } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** POST /api/connectors/meta/ad-accounts/campaigns */
async function handleCreateCampaign(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const body = (await request.json()) as JsonObject;

    const name = body.name;
    const objective = body.objective;
    const adAccountId = body.adAccountId;

    if (!adAccountId || !name || !objective) {
      return {
        status: 400,
        body: { error: "adAccountId, name, and objective are required" },
      };
    }

    const res = await createMetaCampaign({
      params: {
        adAccountId,
        name,
        objective,
        status: body.status || "PAUSED",
        dailyBudget: body.dailyBudget ?? body.daily_budget,
        specialAdCategories:
          body.specialAdCategories ?? body.special_ad_categories,
      },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to create campaign" },
      };
    }

    return { status: 200, body: { success: true, data: res.data } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** PATCH /api/connectors/meta/ad-accounts/campaigns */
async function handleUpdateCampaign(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const body = (await request.json()) as JsonObject;
    const campaignId = body.campaignId;

    if (!campaignId) {
      return { status: 400, body: { error: "campaignId is required" } };
    }

    const res = await updateMetaCampaign({
      params: {
        campaignId,
        name: body.name,
        status: body.status,
        dailyBudget: body.dailyBudget ?? body.daily_budget,
        lifetimeBudget: body.lifetimeBudget ?? body.lifetime_budget,
      },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to update campaign" },
      };
    }

    return { status: 200, body: { success: true, data: res.data } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** DELETE /api/connectors/meta/ad-accounts/campaigns */
async function handleDeleteCampaign(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const { searchParams } = new URL(request.url);
    let campaignId = searchParams.get("campaignId");

    if (!campaignId) {
      const body = (await request.json().catch(() => ({}))) as JsonObject;
      campaignId = body.campaignId;
    }

    if (!campaignId) {
      return { status: 400, body: { error: "campaignId is required" } };
    }

    const res = await deleteMetaCampaign({
      params: { campaignId },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to delete campaign" },
      };
    }

    return { status: 200, body: { success: true, data: res.data } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** GET /api/connectors/meta/ad-accounts/campaigns/adsets */
async function handleListAdSets(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get("adAccountId");
    const limit = searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined;

    if (!adAccountId) {
      return {
        status: 400,
        body: { error: "adAccountId query parameter is required" },
      };
    }

    const res = await fetchMetaAdSets({
      params: { adAccountId, limit },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to fetch ad sets" },
      };
    }

    return { status: 200, body: { success: true, adsets: res.data || [] } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** POST /api/connectors/meta/ad-accounts/campaigns/adsets */
async function handleCreateAdSet(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const body = (await request.json()) as JsonObject;
    const adAccountId = body.adAccountId;
    const campaignId = body.campaignId;
    const name = body.name;

    if (!adAccountId || !campaignId || !name) {
      return {
        status: 400,
        body: { error: "adAccountId, campaignId, and name are required" },
      };
    }

    const res = await createMetaAdSet({
      params: {
        adAccountId,
        campaignId,
        name,
        status: body.status || "PAUSED",
        dailyBudget: body.dailyBudget ?? body.daily_budget,
        billingEvent: body.billingEvent ?? body.billing_event,
        optimizationGoal:
          body.optimizationGoal ?? body.optimization_goal,
        bidAmount: body.bidAmount ?? body.bid_amount,
        targeting: body.targeting,
      },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to create ad set" },
      };
    }

    return { status: 200, body: { success: true, id: res.data?.id } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** PATCH /api/connectors/meta/ad-accounts/campaigns/adsets */
async function handleUpdateAdSet(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const body = (await request.json()) as JsonObject;
    const adSetId = body.adSetId;

    if (!adSetId) {
      return { status: 400, body: { error: "adSetId is required" } };
    }

    const res = await updateMetaAdSet({
      params: {
        adSetId,
        name: body.name,
        status: body.status,
        dailyBudget:
          body.dailyBudget !== undefined
            ? Number(body.dailyBudget)
            : undefined,
        bidAmount:
          body.bidAmount !== undefined
            ? Number(body.bidAmount)
            : undefined,
      },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to update ad set" },
      };
    }

    return { status: 200, body: { success: true, data: res.data } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** DELETE /api/connectors/meta/ad-accounts/campaigns/adsets */
async function handleDeleteAdSet(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const { searchParams } = new URL(request.url);
    const adSetId = searchParams.get("adSetId");

    if (!adSetId) {
      return {
        status: 400,
        body: { error: "adSetId query parameter is required" },
      };
    }

    const res = await deleteMetaAdSet({
      params: { adSetId },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to delete ad set" },
      };
    }

    return { status: 200, body: { success: true } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/** GET /api/connectors/meta/ad-accounts/campaigns/adsets/ads */
async function handleListAds(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get("adAccountId");
    const limit = searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined;

    if (!adAccountId) {
      return {
        status: 400,
        body: { error: "adAccountId query parameter is required" },
      };
    }

    const res = await fetchMetaAds({
      params: { adAccountId, limit },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success) {
      return {
        status: 502,
        body: { error: res.error?.message || "Failed to fetch ads" },
      };
    }

    return { status: 200, body: { success: true, ads: res.data || [] } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/**
 * POST /api/connectors/meta/ad-accounts/campaigns/adsets/ads/image-creative
 * Accepts multipart/form-data (`file`, `adAccountId`) or JSON
 * (`adAccountId`, `filename`, `imageUrl` | `imageBase64`).
 */
async function handleUploadImageCreative(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const token = connectorRes?.data?.accessToken;
    if (!token) {
      return {
        status: 400,
        body: {
          error: "Meta Ads connector is not connected. Missing access token.",
        },
      };
    }

    const contentType = request.headers.get("content-type") || "";
    let adAccountId = "";
    let filename = `image_${Date.now()}.png`;
    let buffer: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      adAccountId = String(formData.get("adAccountId") || "");
      const file = formData.get("file") as File | null;
      if (!file) {
        return {
          status: 400,
          body: { error: "file is required in formData" },
        };
      }
      filename = file.name || filename;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = (await request.json()) as JsonObject;
      adAccountId = body.adAccountId;
      filename = body.filename || filename;

      if (body.imageBase64) {
        buffer = Buffer.from(body.imageBase64, "base64");
      } else if (body.imageUrl) {
        const fetched = await fetch(body.imageUrl);
        if (!fetched.ok) {
          return {
            status: 400,
            body: {
              error: `Failed to download image from ${body.imageUrl}`,
            },
          };
        }
        buffer = Buffer.from(await fetched.arrayBuffer());
      } else {
        return {
          status: 400,
          body: { error: "Either file, imageBase64, or imageUrl is required" },
        };
      }
    }

    if (!adAccountId) {
      return { status: 400, body: { error: "adAccountId is required" } };
    }

    const actId = adAccountId.startsWith("act_")
      ? adAccountId
      : `act_${adAccountId}`;

    const res = await uploadImageCreative(actId, buffer, filename, token);
    if (!res.success) {
      return {
        status: 502,
        body: {
          error: res.error?.message || "Failed to upload image creative",
        },
      };
    }

    return {
      status: 200,
      body: { success: true, hash: res.data?.hash, url: res.data?.url },
    };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/**
 * POST /api/connectors/meta/ad-accounts/campaigns/adsets/ads/video-creative
 * Accepts multipart/form-data (`file`, `adAccountId`) or JSON
 * (`adAccountId`, `filename`, `videoUrl` | `videoBase64`).
 */
async function handleUploadVideoCreative(
  request: Request,
  userId: string,
): Promise<RouteResult> {
  try {
    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const token = connectorRes?.data?.accessToken;
    if (!token) {
      return {
        status: 400,
        body: {
          error: "Meta Ads connector is not connected. Missing access token.",
        },
      };
    }

    const contentType = request.headers.get("content-type") || "";
    let adAccountId = "";
    let filename = `video_${Date.now()}.mp4`;
    let buffer: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      adAccountId = String(formData.get("adAccountId") || "");
      const file = formData.get("file") as File | null;
      if (!file) {
        return {
          status: 400,
          body: { error: "file is required in formData" },
        };
      }
      filename = file.name || filename;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = (await request.json()) as JsonObject;
      adAccountId = body.adAccountId;
      filename = body.filename || filename;

      if (body.videoBase64) {
        buffer = Buffer.from(body.videoBase64, "base64");
      } else if (body.videoUrl) {
        const fetched = await fetch(body.videoUrl);
        if (!fetched.ok) {
          return {
            status: 400,
            body: {
              error: `Failed to download video from ${body.videoUrl}`,
            },
          };
        }
        buffer = Buffer.from(await fetched.arrayBuffer());
      } else {
        return {
          status: 400,
          body: { error: "Either file, videoBase64, or videoUrl is required" },
        };
      }
    }

    if (!adAccountId) {
      return { status: 400, body: { error: "adAccountId is required" } };
    }

    const actId = adAccountId.startsWith("act_")
      ? adAccountId
      : `act_${adAccountId}`;

    const res = await uploadVideoCreative(actId, buffer, filename, token);
    if (!res.success) {
      return {
        status: 502,
        body: {
          error: res.error?.message || "Failed to upload video creative",
        },
      };
    }

    return { status: 200, body: { success: true, id: res.data?.id } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/* -------------------------------------------------------------------------- */
/* Route table                                                                 */
/* -------------------------------------------------------------------------- */

/** Every Next Meta route, by path and method. */
const ROUTES: Record<string, Partial<Record<HttpMethod, RouteHandler>>> = {
  [`${BASE_PATH}/connect`]: { POST: handleConnect },
  [`${BASE_PATH}/disconnect`]: { POST: handleDisconnect },
  [`${BASE_PATH}/ad-accounts`]: {
    GET: handleListAdAccounts,
    POST: handleSyncAdAccounts,
  },
  [`${BASE_PATH}/ad-accounts/campaigns`]: {
    GET: handleListCampaigns,
    POST: handleCreateCampaign,
    PATCH: handleUpdateCampaign,
    DELETE: handleDeleteCampaign,
  },
  [`${BASE_PATH}/ad-accounts/campaigns/adsets`]: {
    GET: handleListAdSets,
    POST: handleCreateAdSet,
    PATCH: handleUpdateAdSet,
    DELETE: handleDeleteAdSet,
  },
  [`${BASE_PATH}/ad-accounts/campaigns/adsets/ads`]: {
    GET: handleListAds,
  },
  [`${BASE_PATH}/ad-accounts/campaigns/adsets/ads/image-creative`]: {
    POST: handleUploadImageCreative,
  },
  [`${BASE_PATH}/ad-accounts/campaigns/adsets/ads/video-creative`]: {
    POST: handleUploadVideoCreative,
  },
};

/**
 * One `node:http` handler for a fixed path: authenticate, build the Fetch
 * request, dispatch on method, and write the handler's JSON result.
 */
function createRouteHandler(
  methods: Partial<Record<HttpMethod, RouteHandler>>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    // An unread request body must not park a keep-alive connection, the same
    // way `bridge()` handles a streaming request nobody consumed.
    const finish = (status: number, body: unknown): void => {
      writeJson(res, status, body);
      if (!req.readableEnded) req.destroy();
    };

    // The browser UI runs on another origin in development; answer its
    // preflight and credentialled requests before method admission.
    if (!applyCors(req, res)) return;

    const method = (req.method ?? "GET").toUpperCase() as HttpMethod;
    const handler = methods[method];
    if (!handler) {
      res.writeHead(405, { allow: Object.keys(methods).join(", ") });
      res.end();
      if (!req.readableEnded) req.destroy();
      return;
    }

    const userId = await resolveUserId(req);
    if (!userId) {
      finish(401, { error: "Unauthorized" });
      return;
    }

    let request: Request;
    try {
      request = toFetchRequest(req);
    } catch (err) {
      finish(500, { error: messageOf(err) });
      return;
    }

    let result: RouteResult;
    try {
      result = await handler(request, userId);
    } catch (err) {
      result = { status: 500, body: { error: messageOf(err) } };
    }
    finish(result.status, result.body);
  };
}

/**
 * Meta connector routes as a Cordis service on the gateway web server.
 *
 * `webServer` is a static dependency, so the constructor runs only after the
 * listener service has activated and every route registration is owned by this
 * fiber's effect scope.
 */
export class ConnectorsMetaService extends Service {
  static inject = ["webServer"];

  constructor(ctx: Context) {
    super(ctx, "connectorsMeta");

    for (const [path, methods] of Object.entries(ROUTES)) {
      ctx.effect(
        () =>
          ctx.webServer.register({
            kind: "exact",
            path,
            handler: createRouteHandler(methods),
          }),
        `connectors-meta: ${path}`,
      );
    }
  }
}

export default ConnectorsMetaService;
