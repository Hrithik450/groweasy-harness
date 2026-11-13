"use client";

import { useState } from "react";
import {
  ChevronDown,
  CheckCircle2,
  Radio,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { refreshSessionDetailBar } from "../../../session";
import type {
  DetailBarTabProps,
  AdManagerDetailBarData,
  AdManagerCampaign,
} from "../../../../types";
import { MetaCampaignStatus } from "../../../../constants";
import type { AdManagerFilterStatus } from "../types";
import { DetailBarEmptyState } from "../../../common";
import { CampaignAdsSubView } from "./subtabs";

const FILTER_OPTIONS: { value: AdManagerFilterStatus; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: MetaCampaignStatus.ACTIVE, label: "Active" },
  { value: MetaCampaignStatus.PAUSED, label: "Paused" },
  { value: "DRAFT", label: "Draft" },
  { value: MetaCampaignStatus.ARCHIVED, label: "Archived" },
];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function campaignStatusLabel(campaign: AdManagerCampaign): string {
  if (campaign.isDraft) return campaign.statusLabel || "Draft";
  if (campaign.status === MetaCampaignStatus.ACTIVE) return "Active";
  if (!campaign.status) return "Campaign";
  return (
    campaign.status.charAt(0) +
    campaign.status.slice(1).toLowerCase()
  );
}

function statusChipClass(campaign: AdManagerCampaign): string {
  if (campaign.status === MetaCampaignStatus.ACTIVE) {
    return "bg-success-tint text-success border border-success-border";
  }
  if (campaign.status === MetaCampaignStatus.PAUSED) {
    return "bg-warning-tint text-warning border border-warning-border";
  }
  if (campaign.status === MetaCampaignStatus.DELETED) {
    return "bg-destructive-tint text-destructive border border-destructive-border";
  }
  return "bg-secondary text-foreground border border-border";
}

export function CampaignsTab({
  session,
  detailBar,
  isStreaming,
  handleSubmit,
}: DetailBarTabProps<AdManagerDetailBarData>) {
  const [statusFilter, setStatusFilter] =
    useState<AdManagerFilterStatus>("ALL");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCampaign, setSelectedCampaign] =
    useState<AdManagerCampaign | null>(null);

  const campaigns = detailBar.data.campaigns || [];

  const filteredCampaigns = campaigns.filter((campaign) => {
    if (statusFilter === "ALL") return true;
    if (statusFilter === "DRAFT") return campaign.isDraft === true;
    return !campaign.isDraft && campaign.status === statusFilter;
  });

  const currentFilterLabel =
    FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label ||
    "All statuses";

  const handleRefresh = async () => {
    if (isRefreshing || !session?.id) return;
    setIsRefreshing(true);
    try {
      await refreshSessionDetailBar(session.id);
      toast.success("Campaigns refreshed");
    } catch (err) {
      console.error("Failed to refresh session:", err);
      toast.error("Failed to refresh campaigns");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {/* Count + filter row */}
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
        {campaigns.length === 0 ? (
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

              if (campaign.isDraft) {
                return (
                  <article
                    key={campaignId}
                    className="border border-accent-hover bg-warning-tint rounded-none p-3.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-[13px] text-foreground leading-snug break-words min-w-0">
                        {campaign.name}
                      </h3>
                      <span className="shrink-0 px-2 py-0.5 bg-accent text-foreground text-[11px] font-bold rounded-none">
                        {campaign.statusLabel || "Draft"}
                      </span>
                    </div>
                    <p className="text-[12px] text-warning leading-snug break-words">
                      {campaign.descriptiveLine ||
                        campaign.subtitle ||
                        "Not launched yet"}
                    </p>
                  </article>
                );
              }

              const chips = campaign.chips;

              return (
                <button
                  key={campaignId}
                  type="button"
                  onClick={() => setSelectedCampaign(campaign)}
                  className={`w-full text-left border border-border bg-card hover:border-input rounded-none p-3.5 flex flex-col gap-2.5 transition-colors cursor-pointer ${FOCUS_RING}`}
                >
                  <span className="flex items-start justify-between gap-2 w-full">
                    <span className="font-bold text-[13px] text-foreground leading-snug break-words min-w-0">
                      {campaign.name}
                    </span>
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[11px] font-bold rounded-none ${statusChipClass(
                        campaign,
                      )}`}
                    >
                      {campaignStatusLabel(campaign)}
                    </span>
                  </span>

                  {campaign.subtitle && (
                    <span className="text-[12px] text-muted-foreground leading-snug break-words">
                      {campaign.subtitle}
                    </span>
                  )}

                  <span className="grid grid-cols-4 gap-2 w-full tabular-nums">
                    <span className="flex flex-col min-w-0">
                      <span className="text-[10.5px] text-muted-foreground">
                        Spend
                      </span>
                      <span className="font-bold text-[12px] text-foreground truncate">
                        {campaign.spend || "—"}
                      </span>
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-[10.5px] text-muted-foreground">
                        Purchases
                      </span>
                      <span className="font-bold text-[12px] text-foreground truncate">
                        {campaign.purchases ?? campaign.leads ?? "—"}
                      </span>
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-[10.5px] text-muted-foreground">
                        CPA
                      </span>
                      <span className="font-bold text-[12px] text-foreground truncate">
                        {campaign.cpa || campaign.cpl || "—"}
                      </span>
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-[10.5px] text-muted-foreground">
                        ROAS
                      </span>
                      <span className="font-bold text-[12px] text-foreground truncate">
                        {campaign.roas || "—"}
                      </span>
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center gap-1.5 w-full pt-2.5 border-t border-border">
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
                        {chips?.losers}{" "}
                        {chips?.losers === 1 ? "loser" : "losers"}
                      </span>
                    )}
                    {Boolean(chips?.potential) && (
                      <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-none bg-secondary text-foreground">
                        {chips?.potential} potential
                      </span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-foreground whitespace-nowrap">
                      View ads
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Subview takeover */}
      {selectedCampaign && (
        <CampaignAdsSubView
          campaign={selectedCampaign}
          onBack={() => setSelectedCampaign(null)}
          isStreaming={isStreaming}
          handleSubmit={handleSubmit}
        />
      )}
    </>
  );
}
