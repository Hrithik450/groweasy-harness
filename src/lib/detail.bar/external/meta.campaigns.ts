/**
 * Campaigns tab sync: Meta is the source, the code derives every number.
 *
 * No model runs here. One pass fetches live campaigns, their ads, and last-7d
 * insights, computes the metrics the cards print, and replaces the stored
 * snapshot. Ads stay `untested` until the ads-classifier skill classifies
 * them; nothing is fabricated.
 *
 * @module @/lib/detail.bar/sync/campaigns
 */

import {
  executeMetaGraphQuery,
  parseMetaConnector,
  type MetaConnector,
} from "@/lib/connectors/meta.ads";
import {
  resolveDetailBarSession,
  upsertDetailBarItems,
} from "@/lib/detail.bar/service";
import { getConnectorByUserIdAndProviderSlug } from "@/lib/services/connectors.service";
import type { BarItemInput } from "@/lib/detail.bar/service";
import type { CampaignMetrics } from "@/lib/detail.bar/types";

const MAX_CAMPAIGNS = 25;
const MAX_ACCOUNTS = 3;

const PURCHASE_ACTIONS = [
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "purchase",
];
const LEAD_ACTIONS = ["offsite_conversion.fb_pixel_lead", "lead"];

type GraphRow = Record<string, unknown>;

/** Numeric field on a Graph row; absent or malformed reads as 0. */
function num(row: GraphRow, key: string): number {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

/** Sum one action type from Meta's `actions` array. */
function actionCount(row: GraphRow, types: readonly string[]): number {
  const actions = Array.isArray(row.actions) ? (row.actions as GraphRow[]) : [];
  for (const type of types) {
    const hit = actions.find((action) => action.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

/** Purchase value ÷ spend as Meta reports it, if it reports it at all. */
function roasOf(row: GraphRow): number | null {
  const list = Array.isArray(row.purchase_roas)
    ? (row.purchase_roas as GraphRow[])
    : [];
  const hit =
    list.find((entry) => entry.action_type === "omni_purchase") ?? list[0];
  const value = Number(hit?.value);
  return Number.isFinite(value) ? value : null;
}

function money(symbol: string, value: number): string {
  return `${symbol}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(value))}`;
}

function costPer(
  symbol: string,
  spend: number,
  results: number,
): string | undefined {
  if (results <= 0) return undefined;
  return money(symbol, spend / results);
}

function roasText(value: number | null): string | undefined {
  if (value === null) return undefined;
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function symbolOf(currency: string | undefined): string {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "GBP") return "£";
  return "₹";
}

/** Run one Graph query and return its `data` array. */
async function queryRows(userId: string, query: string): Promise<GraphRow[]> {
  const res = await executeMetaGraphQuery({
    params: { queries: [query] },
    context: { userId, providerSlug: "metaAds" },
  });
  const results = (res.data as { results?: Array<Record<string, unknown>> })
    ?.results;
  const row = results?.[0];
  if (!row?.success) return [];
  const data = (row.data as { data?: unknown[] })?.data;
  return Array.isArray(data) ? (data as GraphRow[]) : [];
}

interface AccountSnapshot {
  accountId: string;
  symbol: string;
  campaigns: GraphRow[];
  campaignInsights: Map<string, GraphRow>;
}

async function fetchAccount(
  userId: string,
  accountId: string,
  currency: string | undefined,
): Promise<AccountSnapshot> {
  const currencySymbol = symbolOf(currency);
  const base = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  // Campaigns only: ad-level detail belongs to the health skill.
  const [campaigns, campaignInsights] = await Promise.all([
    queryRows(
      userId,
      `${base}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time&limit=${MAX_CAMPAIGNS}`,
    ),
    queryRows(
      userId,
      `${base}/insights?level=campaign&date_preset=last_7d&fields=campaign_id,spend,impressions,clicks,actions,purchase_roas&limit=${MAX_CAMPAIGNS}`,
    ),
  ]);

  const byCampaign = new Map<string, GraphRow>();
  for (const row of campaignInsights) {
    const id = String(row.campaign_id ?? "");
    if (id) byCampaign.set(id, row);
  }
  return {
    accountId: base,
    symbol: currencySymbol,
    campaigns,
    campaignInsights: byCampaign,
  };
}

/** The card numbers a campaign prints, all derived from its insights row. */
function campaignMetrics(
  snapshot: AccountSnapshot,
  campaignId: string,
): { metrics: CampaignMetrics; description: string } {
  const row = snapshot.campaignInsights.get(campaignId) ?? {};
  const spend = num(row, "spend");
  const purchases = actionCount(row, PURCHASE_ACTIONS);
  const leads = actionCount(row, LEAD_ACTIONS);
  const roas = roasOf(row);

  const metrics: CampaignMetrics = {
    ...(spend > 0 ? { spend: money(snapshot.symbol, spend) } : {}),
    ...(purchases > 0 ? { purchases } : {}),
    ...(leads > 0 ? { leads } : {}),
    ...(costPer(snapshot.symbol, spend, purchases)
      ? { cpa: costPer(snapshot.symbol, spend, purchases) }
      : {}),
    ...(leads > 0 && !purchases
      ? { cpl: costPer(snapshot.symbol, spend, leads) }
      : {}),
    ...(roasText(roas) ? { roas: roasText(roas) } : {}),
  };

  const parts = [
    "Last 7 days",
    purchases > 0 ? `${purchases} purchases` : "",
    leads > 0 && !purchases ? `${leads} leads` : "",
    metrics.cpa ? `CPA ${metrics.cpa}` : "",
  ].filter(Boolean);

  return { metrics, description: parts.join(" · ") };
}

/**
 * Fetch and store the current Meta snapshot for one user.
 *
 * @returns the written counts, or `null` when Meta is not connected.
 */
export async function syncCampaignsDetailBar(
  userId: string,
): Promise<{ campaigns: number; ads: number } | null> {
  const connector = await getConnectorByUserIdAndProviderSlug(
    userId,
    "metaAds",
  );
  const record = connector?.data;
  if (!record || record.status !== "connected" || !record.accessToken) {
    return null;
  }

  const metadata: MetaConnector | null = parseMetaConnector(record.metadata);
  const accounts = (metadata?.adAccounts ?? []).slice(0, MAX_ACCOUNTS);
  if (accounts.length === 0) return null;

  const snapshots = await Promise.all(
    accounts.map((account) =>
      fetchAccount(userId, account.accountId ?? account.id, account.currency),
    ),
  );

  const session = resolveDetailBarSession(userId, "campaigns");
  const items: BarItemInput[] = [];

  for (const snapshot of snapshots) {
    const live = snapshot.campaigns.filter((row) => {
      const status = String(row.effective_status ?? row.status ?? "");
      return status !== "ARCHIVED" && status !== "DELETED";
    });

    for (const row of live.slice(0, MAX_CAMPAIGNS)) {
      const id = String(row.id ?? "");
      if (!id) continue;

      const { metrics, description } = campaignMetrics(snapshot, id);
      items.push({
        id,
        data: {
          id,
          name: String(row.name ?? "Campaign"),
          metaStatus: String(row.effective_status ?? row.status ?? ""),
          objective: String(row.objective ?? ""),
          description,
          metrics,
          createdAt: String(row.created_time ?? ""),
        },
      });
    }
  }

  if (items.length === 0) return { campaigns: 0, ads: 0 };

  if (session) {
    upsertDetailBarItems(session, "campaigns", items);
  }
  return { campaigns: items.length, ads: 0 };
}
