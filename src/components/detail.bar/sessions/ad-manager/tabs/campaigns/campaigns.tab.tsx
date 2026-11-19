"use client";

import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  Radio,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useDetailBarStore } from "@/store/detail.bar.store";
import type {
  Campaign,
  AdManagerDetailBarData,
  DetailBarTabProps,
} from "@/lib/detail.bar/types";
import { useBarPager } from "@/hooks/use.bar.pager";
import { flattenBarItems } from "@/lib/detail.bar/rows";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
} from "@/components/detail.bar/common";
import { formatCompact, formatRoas } from "@/lib/utils/metrics.format";
import {
  campaignChips,
  campaignStatusLabel,
  isDraftCampaign,
  statusChipClass,
} from "./campaigns.shared";

type CampaignFilterStatus = "ALL" | "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

const FILTER_OPTIONS: { value: CampaignFilterStatus; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

/** The tab path these rows live under; opening one pushes this kind. */
const TAB_KIND = "campaigns";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

type CampaignsTabProps = DetailBarTabProps<AdManagerDetailBarData> & {
  /** Opens a campaign at its child tab; the bar handles the level. */
  onOpen: (kind: string, id: string) => void;
};

/** The campaigns list; its rows open the campaign's own child tab. */
export function CampaignsTab({ data, session, onOpen }: CampaignsTabProps) {
  const [statusFilter, setStatusFilter] = useState<CampaignFilterStatus>("ALL");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const barData = data;
  const campaigns: Campaign[] = barData.campaigns ?? [];
  const pager = useBarPager(session?.id ?? "", "campaigns", campaigns);
  const visibleCampaigns = pager.items;

  const filteredCampaigns = visibleCampaigns.filter((campaign) => {
    if (statusFilter === "ALL") return true;
    if (statusFilter === "DRAFT") return isDraftCampaign(campaign);
    return (
      !isDraftCampaign(campaign) &&
      (campaign.metaStatus ?? "").toUpperCase() === statusFilter
    );
  });

  const currentFilterLabel =
    FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label ||
    "All statuses";

  const handleRefresh = async () => {
    if (isRefreshing || !session?.id) return;
    setIsRefreshing(true);
    try {
      const res = await fetch(
        `/api/sessions/${session.id}/bar?field=campaigns&refresh=1`,
      );
      if (!res.ok) throw new Error(`bar refresh ${res.status}`);

      const page = (await res.json()) as { items?: unknown[] };
      if (Array.isArray(page.items)) {
        useDetailBarStore
          .getState()
          .applyRows(session.id, "campaigns", flattenBarItems(page.items));
      }
      toast.success("Campaigns refreshed");
    } catch (err) {
      console.error("Failed to refresh campaigns:", err);
      toast.error("Failed to refresh campaigns");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-muted-foreground min-w-0 truncate">
          {filteredCampaigns.length}{" "}
          {filteredCampaigns.length === 1 ? "campaign" : "campaigns"} · last 7
          days
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {session?.id && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh campaigns"
              className={`p-1.5 text-muted-foreground hover:text-foreground bg-card hover:bg-muted rounded-none border border-border transition-colors cursor-pointer disabled:opacity-60 ${FOCUS_RING}`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isRefreshing ? "animate-spin text-brand" : ""
                }`}
                aria-hidden="true"
              />
            </button>
          )}

          {/* Status filter dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterMenu((open) => !open)}
              aria-expanded={showFilterMenu}
              aria-haspopup="listbox"
              className={`h-8 px-2.5 border border-input bg-card text-foreground hover:bg-muted rounded-none text-[12px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${FOCUS_RING}`}
            >
              <span className="whitespace-nowrap">{currentFilterLabel}</span>
              <ChevronDown
                className="w-3.5 h-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            </button>

            {showFilterMenu && (
              <div
                role="listbox"
                aria-label="Campaign status"
                className="absolute right-0 mt-1 w-40 bg-card border border-border rounded-none py-1 z-30"
              >
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={statusFilter === option.value}
                    onClick={() => {
                      setStatusFilter(option.value);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      statusFilter === option.value
                        ? "bg-muted text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-muted"
                    } ${FOCUS_RING}`}
                  >
                    <span>{option.label}</span>
                    {statusFilter === option.value && (
                      <CheckCircle2
                        className="w-3 h-3 text-success"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campaign cards */}
      {visibleCampaigns.length === 0 ? (
        <DetailBarEmptyState
          icon={Radio}
          title="No Campaigns Yet"
          description="Ask the assistant to review your ad account."
        />
      ) : filteredCampaigns.length === 0 ? (
        <DetailBarEmptyState
          icon={Radio}
          title="No Matching Campaigns"
          description="No campaigns match the selected status filter."
        />
      ) : (
        <div className="space-y-3">
          {filteredCampaigns.map((campaign) => {
            const campaignId = campaign.id || campaign.name;

            if (isDraftCampaign(campaign)) {
              return (
                <article
                  key={campaignId}
                  className="border border-accent-hover bg-warning-tint rounded-none p-3.5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-bold text-[13px] text-foreground leading-snug break-words min-w-0 line-clamp-1">
                      {campaign.name}
                    </h3>
                    <span className="shrink-0 px-2 py-0.5 bg-accent text-foreground text-[11px] font-bold uppercase rounded-none">
                      {campaignStatusLabel(campaign)}
                    </span>
                  </div>
                  <p className="text-[12px] text-warning leading-snug break-words line-clamp-2">
                    {campaign.description || "Not launched yet"}
                  </p>
                </article>
              );
            }

            const chips = campaignChips(campaign);

            return (
              <article
                key={campaignId}
                className="w-full text-left border border-border bg-card rounded-none p-3.5 flex flex-col gap-2.5"
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <h3 className="font-display font-bold text-[13px] text-foreground leading-snug break-words min-w-0 line-clamp-1">
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

                {campaign.description && (
                  <p className="text-[12px] text-muted-foreground leading-snug break-words line-clamp-1">
                    {campaign.description}
                  </p>
                )}

                <div className="grid grid-cols-4 gap-2 w-full tabular-nums">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10.5px] text-muted-foreground">
                      Spend
                    </span>
                    <span className="font-bold text-[12px] text-foreground truncate">
                      {campaign.metrics?.spend || "—"}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10.5px] text-muted-foreground">
                      Purchases
                    </span>
                    <span className="font-bold text-[12px] text-foreground truncate">
                      {formatCompact(
                        campaign.metrics?.purchases ?? campaign.metrics?.leads,
                      ) || "—"}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10.5px] text-muted-foreground">
                      CPA
                    </span>
                    <span className="font-bold text-[12px] text-foreground truncate">
                      {campaign.metrics?.cpa || campaign.metrics?.cpl || "—"}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10.5px] text-muted-foreground">
                      ROAS
                    </span>
                    <span className="font-bold text-[12px] text-foreground truncate">
                      {formatRoas(campaign.metrics?.roas) || "—"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 w-full pt-2.5 border-t border-border">
                  {Boolean(chips?.winners) && (
                    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-none bg-success-tint text-success">
                      {chips?.winners}{" "}
                      {chips?.winners === 1 ? "winner" : "winners"}
                    </span>
                  )}
                  {Boolean(chips?.scalers) && (
                    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-none bg-brand text-primary-foreground">
                      {chips?.scalers}{" "}
                      {chips?.scalers === 1 ? "scaler" : "scalers"}
                    </span>
                  )}
                  {Boolean(chips?.losers) && (
                    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-none bg-destructive-tint text-destructive">
                      {chips?.losers} {chips?.losers === 1 ? "loser" : "losers"}
                    </span>
                  )}
                  {Boolean(chips?.potential) && (
                    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-none bg-secondary text-foreground">
                      {chips?.potential} potential
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpen(TAB_KIND, campaignId)}
                    className={`ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-foreground hover:text-brand transition-colors cursor-pointer ${FOCUS_RING}`}
                  >
                    <span>View ads</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}
