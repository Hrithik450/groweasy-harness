import {
  upsertConnector,
  getConnectorByUserIdAndProviderSlug,
} from "@openai-harness/connector";
import type { Connector } from "@openai-harness/connector";
import {
  ConnectorOutput,
  ConnectorInput,
  ConnectorProfile,
  connectorSuccess,
  connectorError,
} from "@openai-harness/connector";
import {
  type MetaCampaign,
  type MetaAdAccount,
  type MetaAdSet,
  type MetaAd,
  type MetaAdSetParams,
  type CreateMetaCampaignParams,
  MetaAdAccountStatus,
  MetaCampaignStatus,
  MetaAdAccountSchema,
  validateMetaConnector,
  parseMetaConnector,
} from "./types";

/**
 * Verifies a Meta Access Token by checking user profile validity against Meta Graph API v19.0.
 * Pure verification only: returns user profile identity or error.
 * Access token is strictly read from context.accessToken.
 */
export async function verifyMetaToken(
  token: string,
): Promise<ConnectorOutput<ConnectorProfile>> {
  if (!token) {
    return connectorError(
      "No Meta access token provided in context.",
      "AUTH_REQUIRED",
    );
  }

  try {
    const userRes = await fetch(
      `https://graph.facebook.com/v19.0/me?access_token=${token}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!userRes.ok) {
      const errJson = await userRes.json().catch(() => ({}));
      const msg =
        errJson?.error?.message ||
        `Meta authentication failed: ${userRes.statusText}`;
      const code =
        errJson?.error?.code === 190 ? "TOKEN_EXPIRED" : "AUTH_REQUIRED";
      return connectorError(msg, code);
    }

    const userData = (await userRes.json()) as { id: string; name: string };
    return connectorSuccess<ConnectorProfile>({
      id: String(userData.id || ""),
      name: String(userData.name || "Meta User"),
    });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Failed to connect to Meta API",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Fetches all linked Ad Accounts for the authenticated Meta user.
 * Supports passing either an access token string directly or a ConnectorInput context.
 */
export async function fetchMetaAdAccounts(
  inputOrToken: string | ConnectorInput<unknown>,
): Promise<ConnectorOutput<MetaAdAccount[]>> {
  let token: string | undefined;

  if (typeof inputOrToken === "string") {
    token = inputOrToken.trim();
  } else {
    const { context } = inputOrToken;
    if (!context?.userId) {
      return connectorError(
        "User context required to fetch Meta ad accounts.",
        "AUTH_REQUIRED",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      context.userId,
      context.providerSlug ?? "meta",
    );
    token =
      (context.accessToken || connectorRes?.data?.accessToken) ?? undefined;
  }

  if (!token) {
    return connectorError(
      "Meta Ads connector is not connected. Missing access token.",
      "AUTH_REQUIRED",
    );
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name,amount_spent&access_token=${token}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return connectorError(
        errJson?.error?.message ||
          `Failed to fetch ad accounts: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const json = await res.json();
    const accounts: MetaAdAccount[] = (json.data || []).map((raw: Record<string, unknown>) =>
      MetaAdAccountSchema.parse({
        id: String(raw.id || ""),
        accountId: String(raw.account_id || raw.accountId || ""),
        name: String(raw.name || "Ad Account"),
        currency: String(raw.currency || "USD"),
        timezoneName: String(raw.timezone_name || raw.timezoneName || "UTC"),
        accountStatus: Number(
          raw.account_status ?? raw.accountStatus ?? MetaAdAccountStatus.ACTIVE,
        ),
        amountSpent: raw.amount_spent ? String(raw.amount_spent) : undefined,
      }),
    );
    return connectorSuccess<MetaAdAccount[]>(accounts);
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error querying Meta ad accounts",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Fetches all granted permissions for the authenticated Meta token.
 * Access token is strictly read from context.accessToken.
 */
export async function fetchMetaPermissions(
  token: string,
): Promise<ConnectorOutput<string[]>> {
  if (!token) {
    return connectorSuccess<string[]>([
      "ads_read",
      "read_insights",
      "ads_management",
    ]);
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/permissions?access_token=${token}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      return connectorSuccess<string[]>([
        "ads_read",
        "read_insights",
        "ads_management",
      ]);
    }

    const permData = (await res.json()) as {
      data?: Array<{ permission: string; status: string }>;
    };

    const granted = (permData.data || [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);

    return connectorSuccess<string[]>(
      granted.length > 0
        ? granted
        : ["ads_read", "read_insights", "ads_management"],
    );
  } catch {
    return connectorSuccess<string[]>([
      "ads_read",
      "read_insights",
      "ads_management",
    ]);
  }
}

/**
 * Main synchronization orchestrator:
 * 1. Verifies token validity (verifyMetaToken)
 * 2. Fetches linked ad accounts (fetchMetaAdAccounts) and granted permissions (fetchMetaPermissions)
 * 3. Validates against canonical MetaConnectorSchema
 * 4. Upserts full connector state into database
 */
export async function syncMetaConnector(
  input: ConnectorInput<unknown>,
): Promise<ConnectorOutput<Connector | null>> {
  const context = input.context;
  const userId = context.userId;
  const existingConnector = await getConnectorByUserIdAndProviderSlug(
    userId,
    "meta",
  );
  const existing = existingConnector.data;
  const token = context.accessToken?.trim() ?? existing?.accessToken;

  if (!token) {
    const updated = await upsertConnector({
      userId,
      slug: "metaAds",
      providerSlug: "meta",
      status: "disconnected",
      accessToken: null,
      metadata: null,
      permissions: null,
    });
    return connectorSuccess<Connector | null>(updated.data || null);
  }

  const verification = await verifyMetaToken(token);

  if (!verification.success) {
    await upsertConnector({
      userId,
      slug: "metaAds",
      status: "disconnected",
      providerSlug: "meta",
      accessToken: token,
      metadata: {
        error: verification.error?.message,
      },
    });
    return connectorError(
      verification.error?.message || "Token verification failed",
      verification.error?.code || "AUTH_REQUIRED",
    );
  }

  const [accountsRes, permRes] = await Promise.all([
    fetchMetaAdAccounts(token),
    fetchMetaPermissions(token),
  ]);

  const adAccounts = accountsRes.data ?? [];
  const permissions = permRes.data ?? [
    "ads_read",
    "read_insights",
    "ads_management",
  ];

  const metadataToInsert = validateMetaConnector({
    userId: verification.data?.id,
    userName: verification.data?.name,
    adAccounts,
    permissions,
  });

  const updated = await upsertConnector({
    userId,
    slug: "metaAds",
    providerSlug: "meta",
    status: "connected",
    accessToken: token,
    permissions: permissions,
    metadata: metadataToInsert,
  });

  return connectorSuccess<Connector | null>(updated.data || null);
}

export interface FetchMetaCampaignsParams {
  statusFilter?: MetaCampaignStatus | "ALL";
  adAccountId?: string;
  limit?: number;
}

/**
 * Fetches live campaigns directly from Meta Graph API for an authorized Meta Ad Account.
 * Pure dynamic retrieval from Facebook; campaigns are not persisted to database.
 */
export async function fetchMetaCampaigns(
  input: ConnectorInput<FetchMetaCampaignsParams>,
): Promise<ConnectorOutput<MetaCampaign[]>> {
  try {
    const { params, context } = input;

    if (!context.userId) {
      return connectorError(
        "User context required to fetch Meta campaigns.",
        "AUTH_REQUIRED",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      context.userId,
      context.providerSlug ?? "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;
    const metadata = parseMetaConnector(connector?.metadata);

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const actId = params?.adAccountId?.trim();
    if (!actId) {
      return connectorError(
        "Ad Account ID is strictly required to fetch campaigns.",
        "INVALID_INPUT",
      );
    }

    const limit = params?.limit || 25;

    const matchedAccount = metadata?.adAccounts?.find(
      (a) => a.id === actId || a.accountId === actId,
    );
    const currency = matchedAccount?.currency || "INR";
    const currencySymbol = currency === "INR" ? "₹" : "$";

    const filter = JSON.stringify([
      {
        field: "effective_status",
        operator: "IN",
        value:
          params?.statusFilter && params.statusFilter !== "ALL"
            ? [params.statusFilter]
            : ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"],
      },
    ]);

    const url = `https://graph.facebook.com/v19.0/${actId}/campaigns?fields=id,name,status,objective,created_time,updated_time,daily_budget,lifetime_budget,buying_type&filtering=${encodeURIComponent(
      filter,
    )}&limit=${limit}&access_token=${token}`;

    let res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const fallbackUrl = `https://graph.facebook.com/v19.0/${actId}/campaigns?fields=id,name,status,objective,created_time,updated_time,daily_budget,lifetime_budget,buying_type&limit=${limit}&access_token=${token}`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });

      if (fallbackRes.ok) {
        res = fallbackRes;
      } else {
        const errJson = await res.json().catch(() => ({}));
        return connectorError(
          errJson?.error?.message ||
            `Failed to fetch Meta campaigns: ${res.statusText}`,
          "UPSTREAM_ERROR",
        );
      }
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let campaigns: MetaCampaign[] = (data.data || []).map((c: any) => {
      let budgetFormatted = undefined;
      if (c.daily_budget) {
        const val = Number(c.daily_budget) / 100;
        budgetFormatted = `${currencySymbol}${val.toLocaleString("en-IN")}/day`;
      } else if (c.lifetime_budget) {
        const val = Number(c.lifetime_budget) / 100;
        budgetFormatted = `${currencySymbol}${val.toLocaleString("en-IN")} lifetime`;
      }

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        dailyBudget: c.daily_budget,
        lifetimeBudget: c.lifetime_budget,
        budgetFormatted,
        createdTime: c.created_time,
        updatedTime: c.updated_time,
        buyingType: c.buying_type,
      };
    });

    if (params?.statusFilter && params.statusFilter !== "ALL") {
      campaigns = campaigns.filter((c) => c.status === params.statusFilter);
    }

    return connectorSuccess<MetaCampaign[]>(campaigns);
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error fetching Meta campaigns",
      "NETWORK_ERROR",
    );
  }
}

export interface FetchMetaAdSetsParams {
  adAccountId?: string;
  campaignId?: string;
  limit?: number;
}

/**
 * Fetches live Ad Sets directly from Meta Graph API for a specific Ad Account or Campaign.
 */
export async function fetchMetaAdSets(
  input: ConnectorInput<FetchMetaAdSetsParams>,
): Promise<ConnectorOutput<MetaAdSet[]>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to fetch Meta ad sets.",
        "AUTH_REQUIRED",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;
    const metadata = parseMetaConnector(connector?.metadata);

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const rawActId =
      params?.adAccountId?.trim() || metadata?.adAccounts?.[0]?.id || "";
    const campaignId = params?.campaignId?.trim();

    if (!rawActId && !campaignId) {
      return connectorError(
        "Ad Account ID or Campaign ID is required to fetch ad sets.",
        "INVALID_INPUT",
      );
    }

    const actId =
      rawActId && !rawActId.startsWith("act_") ? `act_${rawActId}` : rawActId;
    const limit = params?.limit || 25;

    const matchedAccount = metadata?.adAccounts?.find(
      (a) => a.id === actId || a.accountId === actId,
    );
    const currency = matchedAccount?.currency || "INR";
    const currencySymbol = currency === "INR" ? "₹" : "$";

    const filter = JSON.stringify([
      {
        field: "effective_status",
        operator: "IN",
        value: ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"],
      },
    ]);

    const targetNode = campaignId || actId;
    const url = `https://graph.facebook.com/v19.0/${targetNode}/adsets?fields=id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_amount,created_time,targeting,campaign_id,campaign{id,name}&filtering=${encodeURIComponent(
      filter,
    )}&limit=${limit}&access_token=${token}`;

    let res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const fallbackUrl = `https://graph.facebook.com/v19.0/${targetNode}/adsets?fields=id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_amount,created_time,targeting,campaign_id,campaign{id,name}&limit=${limit}&access_token=${token}`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });

      if (fallbackRes.ok) {
        res = fallbackRes;
      } else {
        const errJson = await res.json().catch(() => ({}));
        return connectorError(
          errJson?.error?.message ||
            `Failed to fetch Meta ad sets: ${res.statusText}`,
          "UPSTREAM_ERROR",
        );
      }
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adSets: MetaAdSet[] = (data.data || []).map((s: any) => {
      let budgetFormatted = undefined;
      const daily = s.daily_budget ? Number(s.daily_budget) / 100 : undefined;
      const lifetime = s.lifetime_budget
        ? Number(s.lifetime_budget) / 100
        : undefined;

      if (daily) {
        budgetFormatted = `${currencySymbol}${daily.toLocaleString("en-IN")}/day`;
      } else if (lifetime) {
        budgetFormatted = `${currencySymbol}${lifetime.toLocaleString("en-IN")} lifetime`;
      }

      return {
        id: s.id,
        name: s.name,
        status: s.status,
        dailyBudget: daily,
        lifetimeBudget: lifetime,
        budgetFormatted,
        optimizationGoal: s.optimization_goal,
        billingEvent: s.billing_event,
        bidAmount: s.bid_amount ? Number(s.bid_amount) / 100 : undefined,
        targeting: s.targeting,
        campaignId: s.campaign_id || s.campaign?.id,
        campaignName: s.campaign?.name,
        createdTime: s.created_time,
      };
    });

    return connectorSuccess<MetaAdSet[]>(adSets);
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error querying Meta ad sets",
      "NETWORK_ERROR",
    );
  }
}

export interface FetchMetaAdsParams {
  adAccountId?: string;
  adSetId?: string;
  campaignId?: string;
  limit?: number;
}

/**
 * Fetches live Ads directly from Meta Graph API for a specific Ad Account, Ad Set, or Campaign.
 */
export async function fetchMetaAds(
  input: ConnectorInput<FetchMetaAdsParams>,
): Promise<ConnectorOutput<MetaAd[]>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to fetch Meta ads.",
        "AUTH_REQUIRED",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;
    const metadata = parseMetaConnector(connector?.metadata);

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const rawActId =
      params?.adAccountId?.trim() || metadata?.adAccounts?.[0]?.id || "";
    const adSetId = params?.adSetId?.trim();
    const campaignId = params?.campaignId?.trim();

    if (!rawActId && !adSetId && !campaignId) {
      return connectorError(
        "Ad Account ID, Ad Set ID, or Campaign ID is required to fetch ads.",
        "INVALID_INPUT",
      );
    }

    const actId =
      rawActId && !rawActId.startsWith("act_") ? `act_${rawActId}` : rawActId;
    const limit = params?.limit || 25;

    const targetNode = adSetId || campaignId || actId;
    const url = `https://graph.facebook.com/v19.0/${targetNode}/ads?fields=id,name,status,effective_status,adset_id,campaign_id,creative{name,title,body,image_url,thumbnail_url},created_time&limit=${limit}&access_token=${token}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return connectorError(
        errJson?.error?.message ||
          `Failed to fetch Meta ads: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ads: MetaAd[] = (data.data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effective_status,
      adSetId: a.adset_id,
      campaignId: a.campaign_id,
      createdTime: a.created_time,
      creative: a.creative
        ? {
            headline: a.creative.title || a.creative.name,
            primaryText: a.creative.body,
            mediaUrl: a.creative.image_url || a.creative.thumbnail_url,
          }
        : undefined,
    }));

    return connectorSuccess<MetaAd[]>(ads);
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error querying Meta ads",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Fetches a single campaign directly by ID from Meta Graph API.
 */
export async function getMetaCampaignById(options: {
  campaignId: string;
  token?: string;
  userId?: string;
}): Promise<ConnectorOutput<MetaCampaign>> {
  try {
    const { campaignId } = options;
    let token = options.token;

    if (!token && options.userId) {
      const connectorRes = await getConnectorByUserIdAndProviderSlug(
        options.userId,
        "meta",
      );
      token = connectorRes?.data?.accessToken ?? undefined;
    }

    if (!token) {
      return connectorError("Missing Meta access token.", "AUTH_REQUIRED");
    }

    const url = `https://graph.facebook.com/v19.0/${campaignId}?fields=id,name,status,objective,created_time,updated_time,daily_budget,lifetime_budget,buying_type&access_token=${token}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return connectorError(
        errJson?.error?.message ||
          `Failed to fetch campaign ${campaignId}: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const c = await res.json();
    let budgetFormatted = undefined;
    if (c.daily_budget) {
      const val = Number(c.daily_budget) / 100;
      budgetFormatted = `₹${val.toLocaleString("en-IN")}/day`;
    } else if (c.lifetime_budget) {
      const val = Number(c.lifetime_budget) / 100;
      budgetFormatted = `₹${val.toLocaleString("en-IN")} lifetime`;
    }

    const campaign: MetaCampaign = {
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      dailyBudget: c.daily_budget,
      lifetimeBudget: c.lifetime_budget,
      budgetFormatted,
      createdTime: c.created_time,
      updatedTime: c.updated_time,
      buyingType: c.buying_type,
    };

    return connectorSuccess<MetaCampaign>(campaign);
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error fetching Meta campaign by ID",
      "NETWORK_ERROR",
    );
  }
}

export interface UpdateMetaCampaignParams {
  campaignId: string;
  name?: string;
  status?: MetaCampaignStatus | string;
  dailyBudget?: number | string;
  lifetimeBudget?: number | string;
}

/**
 * Updates a live campaign directly on Meta Graph API.
 */
export async function updateMetaCampaign(
  input: ConnectorInput<UpdateMetaCampaignParams>,
): Promise<ConnectorOutput<MetaCampaign>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to update Meta campaign.",
        "AUTH_REQUIRED",
      );
    }

    const campaignId = params?.campaignId?.trim();
    if (!campaignId || !params) {
      return connectorError(
        "Campaign ID (campaignId) is strictly required to update a campaign.",
        "INVALID_INPUT",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const bodyParams = new URLSearchParams();
    if (params.name) bodyParams.set("name", params.name);
    if (params.status) bodyParams.set("status", params.status);
    if (params.dailyBudget !== undefined) {
      const cents = Math.round(Number(params.dailyBudget) * 100);
      bodyParams.set("daily_budget", String(cents));
    }
    if (params.lifetimeBudget !== undefined) {
      const cents = Math.round(Number(params.lifetimeBudget) * 100);
      bodyParams.set("lifetime_budget", String(cents));
    }

    const url = `https://graph.facebook.com/v19.0/${campaignId}?access_token=${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString(),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const detailedMsg =
        errJson?.error?.error_user_msg ||
        errJson?.error?.error_user_title ||
        errJson?.error?.message ||
        `Failed to update Meta campaign: ${res.statusText}`;
      return connectorError(detailedMsg, "UPSTREAM_ERROR");
    }

    const campData = await res.json();
    return connectorSuccess<MetaCampaign>({
      id: campData.id,
      ...campData,
    });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error updating Meta campaign",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Uploads an image creative to Meta Ad Account to get an image hash.
 */
export async function uploadImageCreative(
  adAccountId: string,
  imageBuffer: Buffer,
  filename: string,
  token: string,
): Promise<ConnectorOutput<{ hash: string; url?: string }>> {
  try {
    const form = new FormData();
    form.append(
      "filename",
      new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }),
      filename,
    );
    form.append("access_token", token);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${adAccountId}/adimages`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(25000),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return connectorError(
        err?.error?.message || `Image upload failed (${res.status})`,
        "UPSTREAM_ERROR",
      );
    }

    const data = await res.json();
    const imgInfo =
      (data.images?.[filename] ||
        Object.values(data.images || {})[0]) as Record<string, unknown> | undefined;
    if (typeof imgInfo?.hash === "string") {
      return connectorSuccess({
        hash: imgInfo.hash,
        url: typeof imgInfo.url === "string" ? imgInfo.url : undefined,
      });
    }
    return connectorError("No image hash returned from Meta", "UPSTREAM_ERROR");
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error uploading image to Meta",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Uploads a video creative to Meta Ad Account to get a video ID.
 */
export async function uploadVideoCreative(
  adAccountId: string,
  videoBuffer: Buffer,
  filename: string,
  token: string,
): Promise<ConnectorOutput<{ id: string }>> {
  try {
    const actId = adAccountId.startsWith("act_")
      ? adAccountId
      : `act_${adAccountId}`;
    const form = new FormData();
    form.append(
      "source",
      new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }),
      filename,
    );
    form.append("access_token", token);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${actId}/advideos`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return connectorError(
        err?.error?.message || `Video upload failed (${res.status})`,
        "UPSTREAM_ERROR",
      );
    }

    const data = await res.json();
    if (data.id) {
      return connectorSuccess({ id: data.id });
    }
    return connectorError("No video ID returned from Meta", "UPSTREAM_ERROR");
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error uploading video to Meta",
      "NETWORK_ERROR",
    );
  }
}

export interface CreateMetaAdSetParams extends MetaAdSetParams {
  campaignId: string;
  adAccountId: string;
}

/**
 * Creates an Ad Set under a Campaign.
 */
export async function createMetaAdSet(
  input: ConnectorInput<CreateMetaAdSetParams>,
): Promise<ConnectorOutput<{ id: string }>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to create Meta ad set.",
        "AUTH_REQUIRED",
      );
    }

    const campaignId = params?.campaignId?.trim();
    if (!campaignId) {
      return connectorError(
        "Campaign ID (campaignId) is strictly required to create an ad set.",
        "INVALID_INPUT",
      );
    }

    const rawActId = params?.adAccountId?.trim();
    if (!rawActId) {
      return connectorError(
        "Ad Account ID (adAccountId) is strictly required to create an ad set.",
        "INVALID_INPUT",
      );
    }
    const actId = rawActId.startsWith("act_") ? rawActId : `act_${rawActId}`;

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const form = new FormData();
    form.append("name", params?.name || "Target Audience - Main");
    form.append("campaign_id", campaignId);
    form.append("status", params?.status || "PAUSED");

    const goal = params?.optimizationGoal || "LINK_CLICKS";
    form.append("optimization_goal", goal);
    form.append("billing_event", params?.billingEvent || "IMPRESSIONS");

    const bidValParam = params?.bidAmount;
    if (goal === "LINK_CLICKS") {
      const bidVal = bidValParam ? Math.round(bidValParam * 100) : 200;
      form.append("bid_amount", String(bidVal));
    }

    const setDailyBudget = params?.dailyBudget;
    if (setDailyBudget && setDailyBudget > 0) {
      form.append("daily_budget", String(Math.round(setDailyBudget * 100)));
    }

    const targetingLocations = params?.targeting?.geoLocations || {
      countries: ["IN"],
    };
    const ageMin = params?.targeting?.ageMin ?? 18;
    const ageMax = params?.targeting?.ageMax ?? 65;

    const targeting: Record<string, unknown> = {
      geo_locations: targetingLocations,
      age_min: ageMin,
      age_max: ageMax,
    };
    if (params?.targeting?.genders && params.targeting.genders.length > 0) {
      targeting.genders = params.targeting.genders;
    }
    if (params?.targeting?.interests && params.targeting.interests.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interestList = params.targeting.interests.map((it: any) =>
        typeof it === "string" ? { name: it, id: it } : it,
      );
      targeting.flexible_spec = [{ interests: interestList }];
    }
    form.append("targeting", JSON.stringify(targeting));
    form.append("access_token", token);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${actId}/adsets`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return connectorError(
        err?.error?.message || `AdSet creation failed (${res.status})`,
        "UPSTREAM_ERROR",
      );
    }

    const data = await res.json();
    return connectorSuccess({ id: data.id });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error creating Meta ad set",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Creates a new campaign in the connected Meta Ad Account with optional Ad Set and Creative.
 */
export async function createMetaCampaign(
  input: ConnectorInput<CreateMetaCampaignParams>,
): Promise<ConnectorOutput<MetaCampaign>> {
  try {
    const { params, context } = input;

    if (!context.userId) {
      return connectorError(
        "User context required to create Meta campaign.",
        "AUTH_REQUIRED",
      );
    }

    if (!params) {
      return connectorError(
        "Campaign parameters are required.",
        "INVALID_INPUT",
      );
    }

    const rawActId = params.adAccountId?.trim();
    if (!rawActId) {
      return connectorError(
        "Ad Account ID (adAccountId) is strictly required to create a campaign.",
        "INVALID_INPUT",
      );
    }
    const actId = rawActId.startsWith("act_") ? rawActId : `act_${rawActId}`;

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      context.userId,
      context.providerSlug ?? "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const formData = new FormData();
    formData.append("name", params.name);
    formData.append("objective", params.objective);
    formData.append("status", params.status || "PAUSED");
    const specialCategories = params.specialAdCategories || [];
    formData.append("special_ad_categories", JSON.stringify(specialCategories));

    const dailyBudget = params.dailyBudget;
    const numDailyBudget = dailyBudget ? Number(dailyBudget) : undefined;
    if (numDailyBudget && numDailyBudget > 0) {
      const budgetSubunits = Math.round(numDailyBudget * 100);
      formData.append("daily_budget", String(budgetSubunits));
    } else {
      formData.append("is_adset_budget_sharing_enabled", "false");
    }
    formData.append("access_token", token);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${actId}/campaigns`,
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return connectorError(
        errJson?.error?.message ||
          `Meta campaign creation failed: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    const campData = await res.json();
    return connectorSuccess<MetaCampaign>({
      id: campData.id,
      ...campData,
    });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error creating Meta campaign",
      "NETWORK_ERROR",
    );
  }
}

export interface DeleteMetaCampaignParams {
  campaignId: string;
}

/**
 * Deletes a Meta campaign by ID.
 */
export async function deleteMetaCampaign(
  input: ConnectorInput<DeleteMetaCampaignParams>,
): Promise<ConnectorOutput<{ deleted: true }>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to delete Meta campaign.",
        "AUTH_REQUIRED",
      );
    }

    if (!params?.campaignId) {
      return connectorError(
        "Campaign ID is required to delete Meta campaign.",
        "INVALID_INPUT",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;
    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected.",
        "AUTH_REQUIRED",
      );
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${params.campaignId}?access_token=${token}`,
      {
        method: "DELETE",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return connectorError(
        errJson?.error?.message ||
          `Failed to delete campaign: ${res.statusText}`,
        "UPSTREAM_ERROR",
      );
    }

    return connectorSuccess<{ deleted: true }>({ deleted: true });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Failed to delete campaign",
      "NETWORK_ERROR",
    );
  }
}

export interface UpdateMetaAdSetParams {
  adSetId: string;
  name?: string;
  status?: string;
  dailyBudget?: number;
  bidAmount?: number;
}

export interface DeleteMetaAdSetParams {
  adSetId: string;
}

/**
 * Updates an Ad Set on Meta.
 */
export async function updateMetaAdSet(
  input: ConnectorInput<UpdateMetaAdSetParams>,
): Promise<ConnectorOutput<MetaAdSet>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to update Meta ad set.",
        "AUTH_REQUIRED",
      );
    }

    const adSetId = params?.adSetId?.trim();
    if (!adSetId || !params) {
      return connectorError(
        "Ad Set ID (adSetId) is strictly required to update an ad set.",
        "INVALID_INPUT",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const bodyParams = new URLSearchParams();
    if (params.name) bodyParams.set("name", params.name);
    if (params.status) bodyParams.set("status", params.status);
    if (params.dailyBudget !== undefined) {
      const cents = Math.round(Number(params.dailyBudget) * 100);
      bodyParams.set("daily_budget", String(cents));
    }
    if (params.bidAmount !== undefined) {
      const cents = Math.round(Number(params.bidAmount) * 100);
      bodyParams.set("bid_amount", String(cents));
    }

    const url = `https://graph.facebook.com/v19.0/${adSetId}?access_token=${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString(),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const detailedMsg =
        errJson?.error?.error_user_msg ||
        errJson?.error?.error_user_title ||
        errJson?.error?.message ||
        `Failed to update Meta ad set: ${res.statusText}`;
      return connectorError(detailedMsg, "UPSTREAM_ERROR");
    }

    const adSetData = await res.json();
    return connectorSuccess<MetaAdSet>({
      id: adSetData.id || adSetId,
      ...adSetData,
    });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error updating Meta ad set",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Deletes an Ad Set on Meta Graph API.
 */
export async function deleteMetaAdSet(
  input: ConnectorInput<DeleteMetaAdSetParams>,
): Promise<ConnectorOutput<{ deleted: true }>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to delete Meta ad set.",
        "AUTH_REQUIRED",
      );
    }

    if (!params?.adSetId) {
      return connectorError(
        "Ad Set ID is required to delete Meta ad set.",
        "INVALID_INPUT",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;
    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected.",
        "AUTH_REQUIRED",
      );
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${params.adSetId}?access_token=${token}`,
      {
        method: "DELETE",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const detailedMsg =
        errJson?.error?.error_user_msg ||
        errJson?.error?.error_user_title ||
        errJson?.error?.message ||
        `Failed to delete ad set: ${res.statusText}`;
      return connectorError(detailedMsg, "UPSTREAM_ERROR");
    }

    return connectorSuccess<{ deleted: true }>({ deleted: true });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Failed to delete ad set",
      "NETWORK_ERROR",
    );
  }
}

export interface ExecuteMetaGraphQueryParams {
  queries: string[];
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown> | URLSearchParams;
}

export interface MetaGraphQueryResult {
  query: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface CreateMetaAdParams {
  adAccountId: string;
  adSetId: string;
  name: string;
  status?: "PAUSED" | "ACTIVE";
  creative: {
    type: "image" | "video";
    name?: string;
    mediaUrl: string;
    headline: string;
    primaryText: string;
    description?: string;
    callToAction?: string;
    destinationUrl: string;
    pageId?: string;
    imageHash?: string;
    videoId?: string;
  };
}

/**
 * Creates an AdCreative and corresponding Ad under an AdSet in Meta Ads Manager.
 * Supports static image creative and motion/video creative.
 */
export async function createMetaAd(
  input: ConnectorInput<CreateMetaAdParams>,
): Promise<
  ConnectorOutput<{
    id: string;
    name: string;
    status: string;
    creativeId: string;
    adSetId: string;
  }>
> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to create Meta ad.",
        "AUTH_REQUIRED",
      );
    }

    if (!params) {
      return connectorError("Ad parameters are required.", "INVALID_INPUT");
    }

    const rawActId = params.adAccountId?.trim();
    if (!rawActId) {
      return connectorError(
        "Ad Account ID (adAccountId) is strictly required to create an ad.",
        "INVALID_INPUT",
      );
    }
    const actId = rawActId.startsWith("act_") ? rawActId : `act_${rawActId}`;

    const adSetId = params.adSetId?.trim();
    if (!adSetId) {
      return connectorError(
        "Ad Set ID (adSetId) is strictly required to create an ad.",
        "INVALID_INPUT",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "meta",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const creative = params.creative;
    if (!creative) {
      return connectorError(
        "Creative parameters are required.",
        "INVALID_INPUT",
      );
    }

    let pageId = creative.pageId?.trim();
    if (!pageId) {
      const pageRes = await fetch(
        `https://graph.facebook.com/v22.0/me/accounts?fields=id,name&limit=1&access_token=${token}`,
        { headers: { Accept: "application/json" } },
      );
      if (pageRes.ok) {
        const pageJson = await pageRes.json().catch(() => ({}));
        pageId = pageJson?.data?.[0]?.id;
      }
    }

    const storySpec: Record<string, unknown> = {};
    if (pageId) {
      storySpec.page_id = pageId;
    }

    if (creative.type === "video") {
      storySpec.video_data = {
        video_id:
          creative.videoId ||
          (/^\d+$/.test(creative.mediaUrl) ? creative.mediaUrl : undefined),
        message: creative.primaryText,
        title: creative.headline,
        link_description: creative.description || "",
        image_url: creative.mediaUrl,
        call_to_action: {
          type: creative.callToAction || "LEARN_MORE",
          value: { link: creative.destinationUrl },
        },
      };
    } else {
      const linkData: Record<string, unknown> = {
        link: creative.destinationUrl,
        message: creative.primaryText,
        name: creative.headline,
        description: creative.description || "",
        picture: creative.mediaUrl,
        call_to_action: {
          type: creative.callToAction || "LEARN_MORE",
          value: { link: creative.destinationUrl },
        },
      };
      if (creative.imageHash) {
        linkData.image_hash = creative.imageHash;
      }
      storySpec.link_data = linkData;
    }

    const creativeForm = new FormData();
    creativeForm.append("name", creative.name || `${params.name} Creative`);
    creativeForm.append("object_story_spec", JSON.stringify(storySpec));
    creativeForm.append("access_token", token);

    const creativeRes = await fetch(
      `https://graph.facebook.com/v22.0/${actId}/adcreatives`,
      {
        method: "POST",
        body: creativeForm,
        signal: AbortSignal.timeout(15000),
      },
    );

    const creativeJson = await creativeRes.json().catch(() => ({}));
    if (!creativeRes.ok || !creativeJson.id) {
      const errObj = creativeJson.error as Record<string, unknown> | undefined;
      const errorMsg =
        (errObj?.error_user_msg as string) ||
        (errObj?.message as string) ||
        `Failed to create AdCreative on Meta (${creativeRes.status})`;
      return connectorError(errorMsg, "UPSTREAM_ERROR");
    }

    const creativeId = creativeJson.id as string;

    const adForm = new FormData();
    adForm.append("name", params.name);
    adForm.append("adset_id", adSetId);
    adForm.append("creative", JSON.stringify({ creative_id: creativeId }));
    adForm.append("status", params.status || "PAUSED");
    adForm.append("access_token", token);

    const adRes = await fetch(`https://graph.facebook.com/v22.0/${actId}/ads`, {
      method: "POST",
      body: adForm,
      signal: AbortSignal.timeout(15000),
    });

    const adJson = await adRes.json().catch(() => ({}));
    if (!adRes.ok || !adJson.id) {
      const errObj = adJson.error as Record<string, unknown> | undefined;
      const errorMsg =
        (errObj?.error_user_msg as string) ||
        (errObj?.message as string) ||
        `Failed to create Ad on Meta (${adRes.status})`;
      return connectorError(errorMsg, "UPSTREAM_ERROR");
    }

    return connectorSuccess({
      id: adJson.id as string,
      name: params.name,
      status: params.status || "PAUSED",
      creativeId,
      adSetId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error creating Meta ad";
    return connectorError(msg, "NETWORK_ERROR");
  }
}

/**
 * Universal Meta Graph API query executor (v22.0).
 * Supports executing batch queries (up to 5 in parallel) via queries array.
 * Access token is securely resolved and injected strictly on the backend.
 */
export async function executeMetaGraphQuery(
  input: ConnectorInput<ExecuteMetaGraphQueryParams>,
): Promise<ConnectorOutput<Record<string, unknown>>> {
  try {
    const { params, context } = input;

    if (!context?.userId) {
      return connectorError(
        "User context required to query Meta Graph API.",
        "AUTH_REQUIRED",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      context.userId,
      context.providerSlug ?? "meta",
    );
    const connector = connectorRes?.data;
    const token =
      context.accessToken ??
      connector?.accessToken ??
      process.env.META_ACCESS_TOKEN;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const rawQueries = (params?.queries || [])
      .filter((q) => typeof q === "string" && q.trim().length > 0)
      .map((q) => q.trim());

    if (rawQueries.length === 0) {
      return connectorError(
        "Queries array is required to execute Meta Graph API queries.",
        "INVALID_INPUT",
      );
    }

    const activeQueries = rawQueries.slice(0, 5);

    const executeOne = async (
      rawQuery: string,
    ): Promise<MetaGraphQueryResult> => {
      try {
        const resolvedQuery = rawQuery.replace(/^\/+/, "");
        let targetUrl: string;
        if (resolvedQuery.startsWith("https://graph.facebook.com/")) {
          targetUrl = resolvedQuery;
        } else {
          targetUrl = `https://graph.facebook.com/v22.0/${resolvedQuery}`;
        }

        const separator = targetUrl.includes("?") ? "&" : "?";
        if (!targetUrl.includes("access_token=")) {
          targetUrl = `${targetUrl}${separator}access_token=${token}`;
        }

        const method = params?.method || "GET";
        const headers: Record<string, string> = { Accept: "application/json" };
        let body: BodyInit | undefined = undefined;

        if (method !== "GET" && params?.body) {
          if (params.body instanceof URLSearchParams) {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            body = params.body.toString();
          } else {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(params.body);
          }
        }

        const res = await fetch(targetUrl, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(15000),
        });

        const json = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;

        if (!res.ok) {
          const errObj = json.error as Record<string, unknown> | undefined;
          const errorMsg =
            (errObj?.error_user_msg as string) ||
            (errObj?.message as string) ||
            `Meta Graph API query failed with status ${res.status}`;
          return {
            query: rawQuery,
            success: false,
            error: errorMsg,
          };
        }

        return {
          query: rawQuery,
          success: true,
          data: json,
        };
      } catch (err) {
        return {
          query: rawQuery,
          success: false,
          error: err instanceof Error ? err.message : "Failed to execute query",
        };
      }
    };

    const results = await Promise.all(activeQueries.map((q) => executeOne(q)));

    return connectorSuccess<Record<string, unknown>>({
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      results,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to execute Meta graph query";
    return connectorError(msg, "NETWORK_ERROR");
  }
}
