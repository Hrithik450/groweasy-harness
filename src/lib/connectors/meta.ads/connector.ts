import {
  upsertConnector,
  getConnectorByUserIdAndProviderSlug,
} from "@/lib/services";
import { OAuthConnectionRecord } from "@/lib/db";
import {
  ConnectorOutput,
  ConnectorInput,
  ConnectorProfile,
  connectorSuccess,
  connectorError,
} from "@/lib/connectors/types";
import {
  type MetaCampaign,
  type MetaAdAccount,
  type MetaAdSet,
  type MetaAd,
  type MetaAdSetParams,
  type MetaAdParams,
  type MetaCreative,
  type MetaCreativeParams,
  type MetaCampaignParams,
  MetaAdAccountStatus,
  MetaBidStrategy,
  MetaBillingEvent,
  MetaCampaignObjective,
  MetaCampaignStatus,
  MetaOptimizationGoal,
  MetaAdAccountSchema,
  validateMetaConnector,
  parseMetaConnector,
} from "./types";

/** Meta's detailed error: message, code, subcode, and blamed fields. */
function metaErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: Record<string, unknown> } | null)?.error;
  if (!error) return fallback;

  const parts: string[] = [];
  for (const key of ["error_user_msg", "error_user_title", "message"]) {
    const value = error[key];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }
  if (error.code !== undefined) parts.push(`code ${String(error.code)}`);
  if (error.error_subcode !== undefined) {
    parts.push(`subcode ${String(error.error_subcode)}`);
  }
  const data = error.error_data as
    | { blame_field_specs?: unknown }
    | undefined;
  if (data?.blame_field_specs) {
    parts.push(`fields ${JSON.stringify(data.blame_field_specs)}`);
  }
  // Meta sometimes returns only "Invalid parameter"; keep the raw payload.
  if (error.code === undefined && error.error_subcode === undefined) {
    parts.push(`raw ${JSON.stringify(error)}`);
  }
  return parts.join(" · ") || fallback;
}

/** Objective → optimization goals Meta accepts for its ad sets. */
const GOALS_BY_OBJECTIVE: Partial<
  Record<MetaCampaignObjective, readonly MetaOptimizationGoal[]>
> = {
  [MetaCampaignObjective.OUTCOME_SALES]: [
    MetaOptimizationGoal.OFFSITE_CONVERSIONS,
    MetaOptimizationGoal.VALUE,
  ],
  [MetaCampaignObjective.OUTCOME_LEADS]: [
    MetaOptimizationGoal.OFFSITE_CONVERSIONS,
    MetaOptimizationGoal.LEAD_GENERATION,
    MetaOptimizationGoal.QUALITY_LEAD,
    MetaOptimizationGoal.CONVERSATIONS,
  ],
  [MetaCampaignObjective.OUTCOME_TRAFFIC]: [
    MetaOptimizationGoal.LINK_CLICKS,
    MetaOptimizationGoal.LANDING_PAGE_VIEWS,
    MetaOptimizationGoal.IMPRESSIONS,
    MetaOptimizationGoal.REACH,
  ],
  [MetaCampaignObjective.OUTCOME_AWARENESS]: [
    MetaOptimizationGoal.REACH,
    MetaOptimizationGoal.IMPRESSIONS,
    MetaOptimizationGoal.AD_RECALL_LIFT,
  ],
  [MetaCampaignObjective.OUTCOME_ENGAGEMENT]: [
    MetaOptimizationGoal.POST_ENGAGEMENT,
    MetaOptimizationGoal.PAGE_LIKES,
    MetaOptimizationGoal.EVENT_RESPONSES,
    MetaOptimizationGoal.CONVERSATIONS,
    MetaOptimizationGoal.THRUPLAY,
    MetaOptimizationGoal.VISIT_INSTAGRAM_PROFILE,
    MetaOptimizationGoal.MESSAGING_PURCHASE_CONVERSION,
    MetaOptimizationGoal.MESSAGING_DEEP_CONVERSATION_AND_FOLLOW,
  ],
  [MetaCampaignObjective.OUTCOME_APP_PROMOTION]: [
    MetaOptimizationGoal.APP_INSTALLS,
    MetaOptimizationGoal.OFFSITE_CONVERSIONS,
    MetaOptimizationGoal.VALUE,
  ],
};

/** Optimization goal → billing events Meta accepts. */
const BILLING_BY_GOAL: Partial<
  Record<MetaOptimizationGoal, readonly MetaBillingEvent[]>
> = {
  [MetaOptimizationGoal.LINK_CLICKS]: [
    MetaBillingEvent.LINK_CLICKS,
    MetaBillingEvent.IMPRESSIONS,
  ],
  [MetaOptimizationGoal.IMPRESSIONS]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.REACH]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.OFFSITE_CONVERSIONS]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.VALUE]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.APP_INSTALLS]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.POST_ENGAGEMENT]: [
    MetaBillingEvent.IMPRESSIONS,
    MetaBillingEvent.POST_ENGAGEMENT,
  ],
  [MetaOptimizationGoal.THRUPLAY]: [
    MetaBillingEvent.IMPRESSIONS,
    MetaBillingEvent.THRUPLAY,
  ],
  [MetaOptimizationGoal.LEAD_GENERATION]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.QUALITY_LEAD]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.CONVERSATIONS]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.PAGE_LIKES]: [MetaBillingEvent.IMPRESSIONS],
  [MetaOptimizationGoal.LANDING_PAGE_VIEWS]: [MetaBillingEvent.IMPRESSIONS],
};

/** Precise, pre-flight reason an ad set is invalid for its campaign. */
function adSetComboError(
  objective: string,
  goal: string,
  billing: string,
  params: MetaAdSetParams | undefined,
  campaignBidStrategy = "",
): string | null {
  const allowed = GOALS_BY_OBJECTIVE[objective as MetaCampaignObjective];
  if (allowed && !allowed.includes(goal as MetaOptimizationGoal)) {
    return `optimizationGoal "${goal}" is not valid for a ${objective} campaign. Use one of: ${allowed.join(", ")}.`;
  }

  const billings = BILLING_BY_GOAL[goal as MetaOptimizationGoal];
  if (billings && !billings.includes(billing as MetaBillingEvent)) {
    return `billingEvent "${billing}" is not valid with optimizationGoal "${goal}". Use one of: ${billings.join(", ")}.`;
  }

  const bidStrategy = params?.bidStrategy || campaignBidStrategy;

  if (
    params?.bidAmount !== undefined &&
    params?.bidStrategy &&
    params.bidStrategy !== MetaBidStrategy.LOWEST_COST_WITH_BID_CAP
  ) {
    return 'bidAmount requires bidStrategy "LOWEST_COST_WITH_BID_CAP".';
  }
  if (
    bidStrategy === MetaBidStrategy.LOWEST_COST_WITH_BID_CAP &&
    params?.bidAmount === undefined
  ) {
    return 'The campaign uses "LOWEST_COST_WITH_BID_CAP"; provide bidAmount (bid cap) or set a different bidStrategy.';
  }
  if (bidStrategy === MetaBidStrategy.COST_CAP && params?.bidAmount === undefined) {
    return 'bidStrategy "COST_CAP" requires bidAmount (average target cost).';
  }
  if (
    bidStrategy === MetaBidStrategy.MINIMUM_ROAS &&
    params?.bidConstraints?.roasAverageFloor === undefined
  ) {
    return 'bidStrategy "MINIMUM_ROAS" requires bidConstraints.roasAverageFloor.';
  }
  if (goal === "APP_INSTALLS" && !params?.promotedObject?.applicationId) {
    return 'optimizationGoal "APP_INSTALLS" requires promotedObject.applicationId.';
  }
  if (
    (goal === "OFFSITE_CONVERSIONS" || goal === "VALUE") &&
    !params?.promotedObject?.pixelId
  ) {
    return `${goal} requires promotedObject.pixelId (and customEventType); query a pixel with queryMeta first.`;
  }
  return null;
}

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
      context.providerSlug ?? "metaAds",
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
    const accounts: MetaAdAccount[] = (json.data || []).map((raw: any) =>
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
): Promise<ConnectorOutput<OAuthConnectionRecord | null>> {
  const context = input.context;
  const userId = context.userId;
  const existingConnector = await getConnectorByUserIdAndProviderSlug(
    userId,
    "metaAds",
  );
  const existing = existingConnector.data;
  const token = context.accessToken?.trim() ?? existing?.accessToken;

  if (!token) {
    const updated = await upsertConnector({
      userId,
      slug: "metaAds",
      providerSlug: "metaAds",
      status: "disconnected",
      accessToken: null,
      metadata: null,
      permissions: null,
    });
    return connectorSuccess<OAuthConnectionRecord | null>(updated.data || null);
  }

  // 1. Verify token validity and profile
  const verification = await verifyMetaToken(token);

  if (!verification.success) {
    await upsertConnector({
      userId,
      status: "disconnected",
      slug: "metaAds",
      providerSlug: "metaAds",
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

  // 2. Fetch ad accounts and permissions in parallel
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

  // 3. Strictly validate metadata against MetaConnectorSchema
  const metadataToInsert = validateMetaConnector({
    userId: verification.data?.id,
    userName: verification.data?.name,
    adAccounts,
    permissions,
  });

  // 4. Upsert connection record to database
  const updated = await upsertConnector({
    userId,
    slug: "metaAds",
    providerSlug: "metaAds",
    status: "connected",
    accessToken: token,
    permissions: permissions,
    metadata: metadataToInsert,
  });

  return connectorSuccess<OAuthConnectionRecord | null>(updated.data || null);
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
      context.providerSlug ?? "metaAds",
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

    // If filtering fails, fallback to basic query without filtering
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
      "metaAds",
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

    let rawActId =
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
    const url = `https://graph.facebook.com/v19.0/${targetNode}/adsets?fields=id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,bid_amount,bid_constraints,start_time,end_time,destination_type,promoted_object,frequency_control_specs,created_time,targeting,campaign_id,campaign{id,name}&filtering=${encodeURIComponent(
      filter,
    )}&limit=${limit}&access_token=${token}`;

    let res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const fallbackUrl = `https://graph.facebook.com/v19.0/${targetNode}/adsets?fields=id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,bid_amount,bid_constraints,start_time,end_time,destination_type,promoted_object,frequency_control_specs,created_time,targeting,campaign_id,campaign{id,name}&limit=${limit}&access_token=${token}`;
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
        bidStrategy: s.bid_strategy,
        bidAmount: s.bid_amount ? Number(s.bid_amount) / 100 : undefined,
        bidConstraints: s.bid_constraints
          ? { roasAverageFloor: s.bid_constraints.roas_average_floor }
          : undefined,
        startTime: s.start_time,
        endTime: s.end_time,
        destinationType: s.destination_type,
        promotedObject: s.promoted_object
          ? {
              pixelId: s.promoted_object.pixel_id,
              customEventType: s.promoted_object.custom_event_type,
              applicationId: s.promoted_object.application_id,
              objectStoreUrl: s.promoted_object.object_store_url,
              productCatalogId: s.promoted_object.product_catalog_id,
              productSetId: s.promoted_object.product_set_id,
              pageId: s.promoted_object.page_id,
            }
          : undefined,
        frequencyControlSpecs: s.frequency_control_specs,
        targeting: s.targeting
          ? {
              geoLocations: s.targeting.geo_locations
                ? {
                    countries: s.targeting.geo_locations.countries,
                    regions: s.targeting.geo_locations.regions,
                    cities: Array.isArray(s.targeting.geo_locations.cities)
                      ? s.targeting.geo_locations.cities.map((city: any) => ({
                          key: city.key,
                          radius: city.radius,
                          distanceUnit: city.distance_unit,
                        }))
                      : undefined,
                  }
                : undefined,
              ageMin: s.targeting.age_min,
              ageMax: s.targeting.age_max,
              genders: s.targeting.genders,
              publisherPlatforms: s.targeting.publisher_platforms,
              devicePlatforms: s.targeting.device_platforms,
              languages: s.targeting.languages,
              locales: s.targeting.locales,
              customAudiences: s.targeting.custom_audiences,
              excludedCustomAudiences:
                s.targeting.excluded_custom_audiences,
              interests: Array.isArray(s.targeting.flexible_spec)
                ? s.targeting.flexible_spec.flatMap((spec: any) =>
                    Array.isArray(spec.interests) ? spec.interests : [],
                  )
                : undefined,
              behaviors: Array.isArray(s.targeting.flexible_spec)
                ? s.targeting.flexible_spec.flatMap((spec: any) =>
                    Array.isArray(spec.behaviors) ? spec.behaviors : [],
                  )
                : undefined,
            }
          : undefined,
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
      "metaAds",
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

    let rawActId =
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
        "metaAds",
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
      "metaAds",
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

export interface UploadMetaImageParams {
  adAccountId: string;
  image: Buffer;
  filename?: string;
}

/**
 * Uploads an image to the Meta ad account and returns its image hash.
 */
export async function uploadImageCreative(
  input: ConnectorInput<UploadMetaImageParams>,
): Promise<ConnectorOutput<{ hash: string; url?: string }>> {
  try {
    const { params, context } = input;
    const userId = context.userId;
    if (!userId) {
      return connectorError(
        "User context required to upload a Meta image.",
        "AUTH_REQUIRED",
      );
    }

    const rawActId = params?.adAccountId?.trim();
    if (!rawActId || !params?.image) {
      return connectorError(
        "adAccountId and image are required to upload an image.",
        "INVALID_INPUT",
      );
    }
    const actId = rawActId.startsWith("act_") ? rawActId : `act_${rawActId}`;
    const filename = params.filename?.trim() || "ad-image.png";

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "metaAds",
    );
    const token = context.accessToken ?? connectorRes?.data?.accessToken;
    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const form = new FormData();
    form.append(
      "filename",
      new Blob([new Uint8Array(params.image)], { type: "image/png" }),
      filename,
    );
    form.append("access_token", token);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${actId}/adimages`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(25000),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return connectorError(
        metaErrorMessage(err, `Image upload failed (${res.status})`),
        "UPSTREAM_ERROR",
      );
    }

    const data = await res.json();
    const imgInfo =
      data.images?.[filename] || (Object.values(data.images || {})[0] as any);
    if (imgInfo?.hash) {
      return connectorSuccess({ hash: imgInfo.hash, url: imgInfo.url });
    }
    return connectorError("No image hash returned from Meta", "UPSTREAM_ERROR");
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error uploading image to Meta",
      "NETWORK_ERROR",
    );
  }
}

export interface UploadMetaVideoParams {
  adAccountId: string;
  video: Buffer;
  filename?: string;
}

/**
 * Uploads a video to the Meta ad account and returns its video id.
 */
export async function uploadVideoCreative(
  input: ConnectorInput<UploadMetaVideoParams>,
): Promise<ConnectorOutput<{ id: string }>> {
  try {
    const { params, context } = input;
    const userId = context.userId;
    if (!userId) {
      return connectorError(
        "User context required to upload a Meta video.",
        "AUTH_REQUIRED",
      );
    }

    const rawActId = params?.adAccountId?.trim();
    if (!rawActId || !params?.video) {
      return connectorError(
        "adAccountId and video are required to upload a video.",
        "INVALID_INPUT",
      );
    }
    const actId = rawActId.startsWith("act_") ? rawActId : `act_${rawActId}`;
    const filename = params.filename?.trim() || "ad-video.mp4";

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "metaAds",
    );
    const token = context.accessToken || connectorRes?.data?.accessToken;
    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    const form = new FormData();
    form.append(
      "source",
      new Blob([new Uint8Array(params.video)], { type: "video/mp4" }),
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
        metaErrorMessage(err, `Video upload failed (${res.status})`),
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

/**
 * Creates an Ad Set under a Campaign.
 */
export async function createMetaAdSet(
  input: ConnectorInput<MetaAdSetParams>,
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
      "metaAds",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    // A campaign with CBO rejects an ad-set budget outright.
    const budgetRes = await fetch(
      `https://graph.facebook.com/v19.0/${campaignId}?fields=objective,bid_strategy,daily_budget,lifetime_budget&access_token=${token}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) },
    );
    let campaignHasBudget = false;
    let campaignObjective = "";
    let campaignBidStrategy = "";
    if (budgetRes.ok) {
      const budgetJson = (await budgetRes.json().catch(() => ({}))) as {
        objective?: string;
        bid_strategy?: string;
        daily_budget?: string;
        lifetime_budget?: string;
      };
      campaignObjective = String(budgetJson.objective ?? "").toUpperCase();
      campaignBidStrategy = String(budgetJson.bid_strategy ?? "");
      campaignHasBudget = Boolean(
        budgetJson.daily_budget || budgetJson.lifetime_budget,
      );
      if (
        campaignHasBudget &&
        ((params?.dailyBudget ?? 0) > 0 || (params?.lifetimeBudget ?? 0) > 0)
      ) {
        return connectorError(
          "This campaign already has a budget. Omit the ad set's dailyBudget/lifetimeBudget (CBO).",
          "INVALID_INPUT",
        );
      }
    }

    const goal = params?.optimizationGoal || "LINK_CLICKS";
    const billingEvent = params?.billingEvent || "IMPRESSIONS";
    const comboError = adSetComboError(
      campaignObjective,
      goal,
      billingEvent,
      params,
      campaignBidStrategy,
    );
    if (comboError) {
      return connectorError(comboError, "INVALID_INPUT");
    }

    const form = new FormData();
    form.append("name", params?.name || "Target Audience - Main");
    form.append("campaign_id", campaignId);
    form.append("status", params?.status || "PAUSED");

    if (params?.startTime) form.append("start_time", params.startTime);
    if (params?.endTime) form.append("end_time", params.endTime);

    form.append("optimization_goal", goal);
    form.append("billing_event", billingEvent);

    if (params?.destinationType) {
      form.append("destination_type", params.destinationType);
    }

    if (params?.promotedObject) {
      const promoted = {
        ...(params.promotedObject.pixelId
          ? { pixel_id: params.promotedObject.pixelId }
          : {}),
        ...(params.promotedObject.customEventType
          ? { custom_event_type: params.promotedObject.customEventType }
          : {}),
        ...(params.promotedObject.applicationId
          ? { application_id: params.promotedObject.applicationId }
          : {}),
        ...(params.promotedObject.objectStoreUrl
          ? { object_store_url: params.promotedObject.objectStoreUrl }
          : {}),
        ...(params.promotedObject.productCatalogId
          ? { product_catalog_id: params.promotedObject.productCatalogId }
          : {}),
        ...(params.promotedObject.productSetId
          ? { product_set_id: params.promotedObject.productSetId }
          : {}),
        ...(params.promotedObject.pageId
          ? { page_id: params.promotedObject.pageId }
          : {}),
      };
      if (Object.keys(promoted).length > 0) {
        form.append("promoted_object", JSON.stringify(promoted));
      }
    }

    if (params?.bidStrategy) {
      form.append("bid_strategy", params.bidStrategy);
    }
    if (params?.bidAmount !== undefined) {
      form.append("bid_amount", String(Math.round(params.bidAmount * 100)));
    }
    if (params?.bidConstraints) {
      form.append(
        "bid_constraints",
        JSON.stringify({
          ...(params.bidConstraints.roasAverageFloor !== undefined
            ? { roas_average_floor: params.bidConstraints.roasAverageFloor }
            : {}),
        }),
      );
    }
    if (params?.frequencyControlSpecs?.length) {
      form.append(
        "frequency_control_specs",
        JSON.stringify(params.frequencyControlSpecs),
      );
    }

    const hasDaily = (params?.dailyBudget ?? 0) > 0;
    const hasLifetime = (params?.lifetimeBudget ?? 0) > 0;
    if (hasDaily && hasLifetime) {
      return connectorError(
        "An ad set takes exactly one of dailyBudget or lifetimeBudget, not both.",
        "INVALID_INPUT",
      );
    }
    if (!hasDaily && !hasLifetime && !campaignHasBudget) {
      return connectorError(
        "An ad set needs a dailyBudget or lifetimeBudget unless the campaign owns the budget (CBO).",
        "INVALID_INPUT",
      );
    }
    if (hasDaily) {
      form.append("daily_budget", String(Math.round(params!.dailyBudget! * 100)));
    }
    if (hasLifetime) {
      if (!params?.startTime || !params?.endTime) {
        return connectorError(
          "A lifetime budget needs startTime and endTime.",
          "INVALID_INPUT",
        );
      }
      form.append(
        "lifetime_budget",
        String(Math.round(params!.lifetimeBudget! * 100)),
      );
    }

    // Targeting
    const geo = params?.targeting?.geoLocations;
    const targetingLocations = geo
      ? {
          ...(geo.countries ? { countries: geo.countries } : {}),
          ...(geo.regions ? { regions: geo.regions } : {}),
          ...(geo.cities
            ? {
                cities: geo.cities.map((city) => ({
                  key: city.key,
                  ...(city.radius !== undefined ? { radius: city.radius } : {}),
                  ...(city.distanceUnit
                    ? { distance_unit: city.distanceUnit }
                    : {}),
                })),
              }
            : {}),
        }
      : { countries: ["IN"] };
    const ageMin = params?.targeting?.ageMin ?? 18;
    const ageMax = params?.targeting?.ageMax ?? 65;

    const targeting: Record<string, unknown> = {
      geo_locations: targetingLocations,
      age_min: ageMin,
      age_max: ageMax,
    };
    if (params?.targeting?.genders?.length) {
      targeting.genders = params.targeting.genders;
    }
    if (params?.targeting?.publisherPlatforms?.length) {
      targeting.publisher_platforms = params.targeting.publisherPlatforms;
    }
    if (params?.targeting?.devicePlatforms?.length) {
      targeting.device_platforms = params.targeting.devicePlatforms;
    }
    if (params?.targeting?.languages?.length) {
      targeting.languages = params.targeting.languages;
    }
    if (params?.targeting?.locales?.length) {
      targeting.locales = params.targeting.locales;
    }
    if (params?.targeting?.customAudiences?.length) {
      targeting.custom_audiences = params.targeting.customAudiences;
    }
    if (params?.targeting?.excludedCustomAudiences?.length) {
      targeting.excluded_custom_audiences =
        params.targeting.excludedCustomAudiences;
    }

    const flexible: Record<string, unknown>[] = [];
    if (params?.targeting?.interests?.length) {
      flexible.push({
        interests: params.targeting.interests.map((it) =>
          typeof it === "string" ? { name: it, id: it } : it,
        ),
      });
    }
    if (params?.targeting?.behaviors?.length) {
      flexible.push({
        behaviors: params.targeting.behaviors.map((it) =>
          typeof it === "string" ? { name: it, id: it } : it,
        ),
      });
    }
    if (flexible.length > 0) {
      targeting.flexible_spec = flexible;
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
        metaErrorMessage(err, `AdSet creation failed (${res.status})`),
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
  input: ConnectorInput<MetaCampaignParams>,
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
      context.providerSlug ?? "metaAds",
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
    if (params.startTime) formData.append("start_time", params.startTime);
    if (params.stopTime) formData.append("stop_time", params.stopTime);
    const specialCategories = params.specialAdCategories || [];
    formData.append("special_ad_categories", JSON.stringify(specialCategories));

    const dailyBudget = params.dailyBudget;
    const numDailyBudget = dailyBudget ? Number(dailyBudget) : undefined;
    const lifetimeBudget = params.lifetimeBudget;
    const numLifetimeBudget = lifetimeBudget
      ? Number(lifetimeBudget)
      : undefined;

    if (numDailyBudget && numDailyBudget > 0) {
      formData.append("daily_budget", String(Math.round(numDailyBudget * 100)));
    } else if (numLifetimeBudget && numLifetimeBudget > 0) {
      formData.append(
        "lifetime_budget",
        String(Math.round(numLifetimeBudget * 100)),
      );
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
        metaErrorMessage(
          errJson,
          `Meta campaign creation failed: ${res.statusText}`,
        ),
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
      "metaAds",
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
      "metaAds",
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
      return connectorError(
        metaErrorMessage(
          errJson,
          `Failed to update Meta ad set: ${res.statusText}`,
        ),
        "UPSTREAM_ERROR",
      );
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

export interface UpdateMetaAdParams {
  adId: string;
  name?: string;
  status?: string;
}

/**
 * Updates an Ad on Meta. Creative is immutable; use a new ad for that.
 */
export async function updateMetaAd(
  input: ConnectorInput<UpdateMetaAdParams>,
): Promise<ConnectorOutput<MetaAd>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to update Meta ad.",
        "AUTH_REQUIRED",
      );
    }

    const adId = params?.adId?.trim();
    if (!adId || !params) {
      return connectorError(
        "Ad ID (adId) is strictly required to update an ad.",
        "INVALID_INPUT",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "metaAds",
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

    const url = `https://graph.facebook.com/v19.0/${adId}?access_token=${token}`;
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
        `Failed to update Meta ad: ${res.statusText}`;
      return connectorError(detailedMsg, "UPSTREAM_ERROR");
    }

    const data = await res.json();
    return connectorSuccess<MetaAd>({ id: data.id || adId, ...data });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error updating Meta ad",
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
      "metaAds",
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

/**
 * Creates an AdCreative in the ad account. Its content is immutable after
 * creation; changing media, copy, page, or CTA means a new creative.
 */
export async function createMetaCreative(
  input: ConnectorInput<MetaCreativeParams>,
): Promise<ConnectorOutput<MetaCreative>> {
  try {
    const { params, context } = input;
    const userId = context.userId;

    if (!userId) {
      return connectorError(
        "User context required to create a Meta creative.",
        "AUTH_REQUIRED",
      );
    }
    if (!params) {
      return connectorError(
        "Creative parameters are required.",
        "INVALID_INPUT",
      );
    }

    if (
      !params.name ||
      !params.headline ||
      !params.primaryText ||
      !params.destinationUrl
    ) {
      return connectorError(
        "name, headline, primaryText, and destinationUrl are required to create a creative.",
        "INVALID_INPUT",
      );
    }

    const rawActId = params.adAccountId?.trim();
    if (!rawActId) {
      return connectorError(
        "Ad Account ID (adAccountId) is strictly required to create a creative.",
        "INVALID_INPUT",
      );
    }
    const actId = rawActId.startsWith("act_") ? rawActId : `act_${rawActId}`;

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "metaAds",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

    let pageId = params.pageId?.trim();
    if (!pageId) {
      const pageRes = await fetch(
        `https://graph.facebook.com/v22.0/me/accounts?fields=id,name&limit=25&access_token=${token}`,
        { headers: { Accept: "application/json" } },
      );
      const pageJson = pageRes.ok ? await pageRes.json().catch(() => ({})) : {};
      const pages: Array<{ id?: string }> = Array.isArray(pageJson?.data)
        ? pageJson.data
        : [];

      if (pages.length === 0) {
        return connectorError(
          "No Facebook Page was returned for this Meta connection. Tell the user to create at least one Facebook Page in their Meta account, then disconnect the Meta connector from our application and reconnect it before retrying.",
          "INVALID_INPUT",
        );
      }
      if (pages.length > 1) {
        return connectorError(
          "The account manages several Facebook Pages. Fetch them with fetchMetaPages and pass pageId explicitly.",
          "INVALID_INPUT",
        );
      }

      pageId = pages[0]?.id;
      if (!pageId) {
        return connectorError(
          "Could not resolve the Facebook Page id.",
          "UPSTREAM_ERROR",
        );
      }
    }

    if (params.type === "video" && !params.videoId) {
      return connectorError(
        "Video creatives need videoId; upload the video first.",
        "INVALID_INPUT",
      );
    }
    if (params.type === "image" && !params.imageHash) {
      return connectorError(
        "Image creatives need imageHash; upload the image first.",
        "INVALID_INPUT",
      );
    }

    const storySpec: Record<string, unknown> = { page_id: pageId };

    if (params.type === "video") {
      storySpec.video_data = {
        video_id: params.videoId,
        message: params.primaryText,
        title: params.headline,
        link_description: params.description || "",
        call_to_action: {
          type: params.callToAction || "LEARN_MORE",
          value: { link: params.destinationUrl },
        },
      };
    } else {
      storySpec.link_data = {
        link: params.destinationUrl,
        message: params.primaryText,
        name: params.headline,
        description: params.description || "",
        image_hash: params.imageHash,
        call_to_action: {
          type: params.callToAction || "LEARN_MORE",
          value: { link: params.destinationUrl },
        },
      };
    }

    const form = new FormData();
    form.append("name", params.name);
    form.append("object_story_spec", JSON.stringify(storySpec));
    form.append("access_token", token);

    const res = await fetch(
      `https://graph.facebook.com/v22.0/${actId}/adcreatives`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(15000),
      },
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) {
      return connectorError(
        metaErrorMessage(
          json,
          `Failed to create AdCreative on Meta (${res.status})`,
        ),
        "UPSTREAM_ERROR",
      );
    }

    return connectorSuccess({
      creativeId: json.id as string,
      adAccountId: actId,
      pageId,
      name: params.name,
      type: params.type,
      headline: params.headline,
      primaryText: params.primaryText,
      ...(params.description ? { description: params.description } : {}),
      callToAction: params.callToAction || "LEARN_MORE",
      destinationUrl: params.destinationUrl,
      ...(params.imageHash ? { imageHash: params.imageHash } : {}),
      ...(params.videoId ? { videoId: params.videoId } : {}),
    });
  } catch (err) {
    return connectorError(
      err instanceof Error ? err.message : "Error creating Meta creative",
      "NETWORK_ERROR",
    );
  }
}

/**
 * Creates an Ad that references an existing creative.
 */
export async function createMetaAd(
  input: ConnectorInput<MetaAdParams>,
): Promise<ConnectorOutput<MetaAd>> {
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

    const creativeId = params.creativeId?.trim();
    if (!creativeId) {
      return connectorError(
        "Creative ID (creativeId) is required to create an ad.",
        "INVALID_INPUT",
      );
    }

    const connectorRes = await getConnectorByUserIdAndProviderSlug(
      userId,
      "metaAds",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken || connector?.accessToken;

    if (!token) {
      return connectorError(
        "Meta Ads connector is not connected. Missing access token.",
        "AUTH_REQUIRED",
      );
    }

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
      return connectorError(
        metaErrorMessage(adJson, `Failed to create Ad on Meta (${adRes.status})`),
        "UPSTREAM_ERROR",
      );
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
      context.providerSlug ?? "metaAds",
    );
    const connector = connectorRes?.data;
    const token = context.accessToken ?? connector?.accessToken;

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
