"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildCampaignAdPrompt } from "@/lib/prompts/campaign.ad";
import { formatCompact, formatRoas } from "@/lib/utils/metrics.format";
import type {
  BarCard,
  Campaign,
  CampaignAd,
  CampaignAdAction,
  ActionStatus,
  AdCategory,
} from "@/lib/detail.bar/types";
import { useBarPager } from "@/hooks/use.bar.pager";
import { useDetailBarStore } from "@/store/detail.bar.store";
import { DetailBarLoadOlder } from "@/components/detail.bar/common";
import { campaignStatusLabel, statusChipClass } from "../shared";
import { AdCard } from "../card";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const GROUPS: { key: AdCategory; label: string }[] = [
  { key: "winner", label: "Winners" },
  { key: "scaler", label: "Scalers" },
  { key: "loser", label: "Losers" },
  { key: "potential", label: "Potential" },
  { key: "untested", label: "Untested" },
];

export interface CampaignsAdsTabProps {
  campaign: Campaign;
  sessionId: string;
  isStreaming?: boolean;
  handleSubmit?: (
    content: string,
    options?: {
      source?: import("@/lib/session/prompt").PromptSource;
      display?: import("@/lib/llm/llm/message").PromptDisplay;
    },
  ) => Promise<void> | void;
  handleUpdateData?: (item: {
    kind: import("@/lib/detail.bar/fields").DetailBarField;
    id: string;
    patch: Record<string, unknown>;
  }) => Promise<void>;
  onBack: () => void;
}

/** One campaign's ads, rendered straight from its `ads` array. */
export function CampaignsAdsTab({
  campaign,
  sessionId,
  isStreaming,
  handleSubmit,
  handleUpdateData,
  onBack,
}: CampaignsAdsTabProps) {
  const [pendingAdId, setPendingAdId] = useState<string | null>(null);
  const [statusByAd, setStatusByAd] = useState<Record<string, ActionStatus>>(
    {},
  );

  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !campaign.id) return;

    let cancelled = false;
    setIsFetching(true);
    setFetchError(null);

    const query = new URLSearchParams({
      field: "campaigns.ads",
      parentId: campaign.id,
    });
    fetch(`/api/sessions/${sessionId}/detail.bar?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`campaign ads ${response.status}`);
        return (await response.json()) as {
          parentId?: string | null;
          items?: unknown[];
          nextCursor?: string | null;
        };
      })
      .then((page) => {
        if (cancelled) return;
        useDetailBarStore
          .getState()
          .mergePage(
            "campaigns.ads",
            page.parentId ?? campaign.id,
            page.items ?? [],
            page.nextCursor ?? null,
          );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[Bar] Could not load campaign ads:", err);
        setFetchError("Could not load this list.");
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, "campaigns.ads", campaign.id]);

  const pager = useBarPager<CampaignAd>(
    sessionId,
    "campaigns.ads",
    campaign.id,
  );
  const ads = pager.items;
  const isLoading = pager.isLoading ?? isFetching;

  const error = fetchError;
  const groups = GROUPS.map((group) => ({
    ...group,
    ads: ads.filter((ad) => ad.category === group.key),
  })).filter((group) => group.ads.length > 0);

  const statusOf = (ad: BarCard<CampaignAd>): ActionStatus =>
    statusByAd[ad.id] ?? (ad.status as ActionStatus | undefined) ?? "pending";

  const saveStatus = (ad: CampaignAd, status: ActionStatus) => {
    setStatusByAd((current) => ({ ...current, [ad.id]: status }));
    void handleUpdateData?.({
      id: ad.id,
      kind: "campaigns.ads",
      patch: { status },
    }).catch(() => toast.error("Failed to save the change"));
  };

  const runAction = async (ad: CampaignAd, action: CampaignAdAction) => {
    if (isStreaming || pendingAdId) return;
    setPendingAdId(ad.id);
    try {
      const draft = buildCampaignAdPrompt(campaign, ad, action);
      await handleSubmit?.(draft.content, {
        source: "detail-bar",
        display: draft.display,
      });
      toast.success("Sent to the assistant");
    } catch (err) {
      console.error("Failed to run campaign action:", err);
      toast.error("Failed to run the action");
    } finally {
      setPendingAdId(null);
    }
  };

  const metrics = campaign.metrics ?? {};
  const stats: { label: string; value: string }[] = [
    { label: "Spend", value: metrics.spend || "—" },
    {
      label: "Purchases",
      value: formatCompact(metrics.purchases ?? metrics.leads) || "—",
    },
    { label: "CPA", value: metrics.cpa || metrics.cpl || "—" },
    { label: "ROAS", value: formatRoas(metrics.roas) || "—" },
  ];

  return (
    <div className="space-y-3 pb-6 panel-slide-in-right">
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer ${FOCUS_RING}`}
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        <span>All campaigns</span>
      </button>

      <header className="border border-border bg-card rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 font-display font-bold text-[13.5px] text-foreground leading-snug break-words line-clamp-2">
            {campaign.name}
          </h3>
          <span
            className={`shrink-0 px-2 py-0.5 text-[11px] font-bold uppercase rounded-none ${statusChipClass(
              campaign,
            )}`}
          >
            {campaignStatusLabel(campaign)}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 tabular-nums">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col min-w-0">
              <span className="text-[10.5px] text-muted-foreground truncate">
                {stat.label}
              </span>
              <span className="font-bold text-[12px] text-foreground truncate">
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Last 7 days · each ad compared with the other ads in its ad set
        </p>
      </header>

      {isLoading && ads.length === 0 ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Loading ads…</span>
        </div>
      ) : error ? (
        <p className="text-[12px] text-destructive leading-relaxed">{error}</p>
      ) : groups.length === 0 ? (
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          No ads are stored for this campaign yet.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider font-mono text-muted-foreground">
                {group.label}
              </span>
              <span className="flex-1 h-px bg-border" />
              <span className="shrink-0 text-[10.5px] font-mono text-muted-2">
                {group.ads.length}
              </span>
            </div>

            <div className="space-y-2">
              {group.ads.map((ad) => (
                <AdCard
                  key={ad.id}
                  ad={ad}
                  busy={pendingAdId === ad.id}
                  disabled={Boolean(isStreaming || pendingAdId)}
                  status={statusOf(ad)}
                  onAction={runAction}
                  onIgnore={(target) => {
                    if (target.status === "ignored") return;
                    saveStatus(target, "ignored");
                  }}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}
