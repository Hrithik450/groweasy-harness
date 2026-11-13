"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  PanelRightClose,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useSidebarStore } from "@openai-harness/client-ui-session";
import type {
  AdManagerCampaign,
  CampaignAd,
  CampaignAdClassification,
} from "../../../../../types";
import { MetaCampaignStatus } from "../../../../../constants";
import { DetailBarEmptyState } from "../../../../common";
import { DEMO_CAMPAIGN_ADS } from "../../../../demo";
import { CampaignAdCard } from "./campaign.ad.card";

type AdFilterType = "all" | CampaignAdClassification;

const AD_FILTER_OPTIONS: { id: AdFilterType; label: string }[] = [
  { id: "all", label: "ALL ADS" },
  { id: "winner", label: "WINNERS" },
  { id: "scaler", label: "SCALERS" },
  { id: "loser", label: "LOSERS" },
  { id: "potential", label: "POTENTIAL" },
];

interface AdGroupConfig {
  key: CampaignAdClassification;
  title: string;
  hint: string;
  headerClass: string;
}

const AD_GROUPS: AdGroupConfig[] = [
  {
    key: "winner",
    title: "WINNERS",
    hint: "Multiply before they tire",
    headerClass: "bg-success-tint text-success",
  },
  {
    key: "scaler",
    title: "SCALERS",
    hint: "Room to spend more",
    headerClass: "bg-brand text-primary-foreground",
  },
  {
    key: "loser",
    title: "LOSERS",
    hint: "Got their fair share, didn't sell",
    headerClass: "bg-destructive-tint text-destructive",
  },
  {
    key: "potential",
    title: "POTENTIAL – NOT TESTED YET",
    hint: "Protected while they prove out",
    headerClass: "bg-secondary text-foreground",
  },
  {
    key: "untested",
    title: "NOT TESTED YET",
    hint: "Not losers: Meta hasn't shown them enough",
    headerClass: "bg-secondary text-foreground",
  },
];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function campaignStatusLabel(campaign: AdManagerCampaign): string {
  if (campaign.isDraft) return campaign.statusLabel || "Draft";
  if (campaign.status === MetaCampaignStatus.ACTIVE) return "Active";
  if (!campaign.status) return "Campaign";
  return (
    campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()
  );
}

function campaignStatusChipClass(campaign: AdManagerCampaign): string {
  if (campaign.status === MetaCampaignStatus.ACTIVE) {
    return "bg-success-tint text-success";
  }
  if (campaign.status === MetaCampaignStatus.PAUSED) {
    return "bg-warning-tint text-warning";
  }
  if (campaign.status === MetaCampaignStatus.DELETED) {
    return "bg-destructive-tint text-destructive";
  }
  return "bg-secondary text-foreground";
}

interface CampaignAdsSubViewProps {
  campaign: AdManagerCampaign;
  onBack: () => void;
  isStreaming?: boolean;
  handleSubmit?: (
    content: string,
    options?: { isHidden?: boolean },
  ) => Promise<void> | void;
}

export function CampaignAdsSubView({
  campaign,
  onBack,
  isStreaming,
  handleSubmit,
}: CampaignAdsSubViewProps) {
  const { toggleRightCollapsed } = useSidebarStore();
  const [filter, setFilter] = useState<AdFilterType>("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const ads =
    campaign.ads && campaign.ads.length > 0
      ? campaign.ads
      : DEMO_CAMPAIGN_ADS;

  const filteredAds = ads.filter((ad) => {
    if (filter === "all") return true;
    return ad.classification === filter;
  });

  const currentFilterLabel =
    AD_FILTER_OPTIONS.find((option) => option.id === filter)?.label ||
    "ALL ADS";

  const handleAdAction = async (
    ad: CampaignAd,
    mode: "primary" | "secondary",
  ) => {
    if (mode === "secondary") {
      const label = ad.secondaryAction?.label || "Optimise";
      const prompt =
        ad.secondaryAction?.prompt ||
        `Run "${label}" for ad "${ad.name}" in campaign "${campaign.name}".`;
      await handleSubmit?.(prompt);
      toast.success(`Dispatched "${label}" for "${ad.name}"`);
      return;
    }

    if (ad.classification === "winner") {
      const prompt = `Multiply variants for winning ad "${ad.name}" from campaign "${campaign.name}". Propose 4 creative variants across new hooks, formats, and other products.`;
      await handleSubmit?.(prompt);
      toast.success(`Dispatched variant multiplication for "${ad.name}"`);
      return;
    }

    if (ad.classification === "scaler") {
      const prompt = `Execute budget scale (+20%) for scaler ad "${ad.name}" in campaign "${campaign.name}".`;
      await handleSubmit?.(prompt);
      toast.success(`Dispatched budget scaling for "${ad.name}"`);
      return;
    }

    if (ad.classification === "loser") {
      const prompt = `Pause losing ad "${ad.name}" in campaign "${campaign.name}" and reallocate budget to the ad set winner.`;
      await handleSubmit?.(prompt);
      toast.success(`Dispatched stop action for "${ad.name}"`);
      return;
    }

    if (ad.classification === "potential" || ad.classification === "untested") {
      const prompt = `Allocate a small ₹300/day test budget to untested ad "${ad.name}" in campaign "${campaign.name}".`;
      await handleSubmit?.(prompt);
      toast.success(`Allocated test budget for "${ad.name}"`);
    }
  };

  return (
    <div className="absolute inset-0 bg-card z-20 flex flex-col select-none">
      {/* Back row + collapse */}
      <div className="h-12 border-b border-border px-3 shrink-0 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all campaigns"
          className={`inline-flex items-center gap-1 min-h-9 px-2 py-1 text-foreground hover:bg-secondary rounded-none text-[13px] font-bold transition-colors cursor-pointer ${FOCUS_RING}`}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>All campaigns</span>
        </button>

        <button
          type="button"
          onClick={toggleRightCollapsed}
          title="Collapse details"
          aria-label="Collapse details"
          className={`w-7 h-7 rounded-none text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center transition-colors cursor-pointer ${FOCUS_RING}`}
        >
          <PanelRightClose className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3.5">
        {/* Campaign header */}
        <div className="space-y-2.5 pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-[14px] text-foreground tracking-tight leading-snug break-words min-w-0">
              {campaign.name}
            </h3>
            <span
              className={`shrink-0 px-2 py-0.5 text-[11px] font-bold rounded-none ${campaignStatusChipClass(
                campaign,
              )}`}
            >
              {campaignStatusLabel(campaign)}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 tabular-nums">
            <div className="flex flex-col min-w-0">
              <span className="text-[10.5px] text-muted-foreground">Spend</span>
              <span className="font-bold text-[12px] text-foreground truncate">
                {campaign.spend || "—"}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10.5px] text-muted-foreground">
                Purchases
              </span>
              <span className="font-bold text-[12px] text-foreground truncate">
                {campaign.purchases ?? campaign.leads ?? "—"}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10.5px] text-muted-foreground">CPA</span>
              <span className="font-bold text-[12px] text-foreground truncate">
                {campaign.cpa || campaign.cpl || "—"}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10.5px] text-muted-foreground">ROAS</span>
              <span className="font-bold text-[12px] text-foreground truncate">
                {campaign.roas || "—"}
              </span>
            </div>
          </div>

          <p className="text-[12px] text-muted-foreground leading-snug break-words">
            Last 7 days · each ad compared with the other ads in its ad set
          </p>
        </div>

        {/* Classification filter */}
        <div className="flex items-center justify-end">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterMenu((open) => !open)}
              aria-expanded={showFilterMenu}
              aria-haspopup="listbox"
              className={`h-8 px-2.5 border border-input bg-card text-foreground hover:bg-muted rounded-none text-[12px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${FOCUS_RING}`}
            >
              <span>{currentFilterLabel}</span>
              <ChevronDown
                className="w-3.5 h-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            </button>

            {showFilterMenu && (
              <div
                role="listbox"
                aria-label="Ad classification"
                className="absolute right-0 mt-1 w-36 bg-card border border-border rounded-none py-1 z-30"
              >
                {AD_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={filter === option.id}
                    onClick={() => {
                      setFilter(option.id);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      filter === option.id
                        ? "bg-muted text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-muted"
                    } ${FOCUS_RING}`}
                  >
                    <span>{option.label}</span>
                    {filter === option.id && (
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

        {/* Grouped ads */}
        {filteredAds.length === 0 ? (
          <DetailBarEmptyState
            icon={Sparkles}
            title="No Matching Ads"
            description="No ads match the selected classification filter."
          />
        ) : (
          <div className="space-y-4">
            {AD_GROUPS.map((group) => {
              const groupAds = filteredAds.filter(
                (ad) => ad.classification === group.key,
              );
              if (groupAds.length === 0) return null;

              return (
                <section key={group.key} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 text-[11px] font-extrabold tracking-[0.06em] rounded-none ${group.headerClass}`}
                    >
                      {group.title}
                    </span>
                    <span className="text-[12px] text-muted-foreground leading-snug">
                      {group.hint}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {groupAds.map((ad) => (
                      <CampaignAdCard
                        key={ad.id}
                        ad={ad}
                        isStreaming={isStreaming}
                        onAction={handleAdAction}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
