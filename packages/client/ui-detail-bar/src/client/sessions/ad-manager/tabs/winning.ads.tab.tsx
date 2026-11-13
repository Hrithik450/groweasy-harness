"use client";

import { useState } from "react";
import {
  Trophy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  Clock,
  Eye,
  Building2,
  Film,
} from "lucide-react";
import type {
  DetailBarTabProps,
  AdManagerDetailBarData,
  WinningAd,
} from "../../../../types";
import { DetailBarEmptyState } from "../../../common";

/**
 * Formats a raw number into a compact string representation (e.g. 380000 -> "380K").
 */
function formatNumberToK(num?: number): string {
  if (num === undefined || num === null) return "-";
  if (num >= 1_000_000) {
    const formatted = (num / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `${formatted}M`;
  }
  if (num >= 1_000) {
    const formatted = (num / 1_000).toFixed(1).replace(/\.0$/, "");
    return `${formatted}K`;
  }
  return num.toString();
}

/**
 * Sample account winning ads displayed for instant front-end review when no ads have been populated yet.
 */
const SAMPLE_ACCOUNT_WINNING_ADS: WinningAd[] = [
  {
    id: "account-win-1",
    brandName: "Mill to Kadai",
    adUrl: "https://adsmanager.facebook.com/adsmanager/manage/ads?act=sample_1",
    daysActive: 28,
    startDate: "Oct 8, 2026",
    impressions: 420000,
    versionCount: 4,
    format: "static",
    structure: {
      stage: "Long-Running Winner",
      angle: "Farm Freshness & Direct Mill",
      hook: "Contrast hook: 'Why pay ₹450 for supermarket oil when fresh crushed is ₹349?'",
      timingBeats: "Top half: ₹450 shelf oil vs ₹349 mill bottle → Bottom: direct farm-crush batch stamp",
      visualPacing: "High contrast price anchor banner with natural harvest palette",
      cpa: "₹36 CPA vs ₹78 sibling median",
      roas: "3.4x ROAS",
    },
    whyItWorks:
      "Direct price-to-freshness contrast drives 52% of total campaign leads at ₹36 CPA. Consistently outperforms sibling ads for 28+ days.",
  },
  {
    id: "account-win-2",
    brandName: "Zero Hexane Purity",
    adUrl: "https://adsmanager.facebook.com/adsmanager/manage/ads?act=sample_2",
    daysActive: 9,
    startDate: "Oct 27, 2026",
    impressions: 165000,
    versionCount: 3,
    format: "video",
    structure: {
      stage: "Proven Winner",
      angle: "Lab Purity & Health Guarantee",
      hook: "Educational reveal: 'Look at the back of your oil bottle for this word...'",
      timingBeats: "0-3s Ingredient reveal -> 3-10s Lab test results -> 10-22s Cold pressed process -> 22-30s Money back guarantee",
      visualPacing: "Fast-paced jump cuts with lab microscope footage",
      audioPacing: "Engaged UGC voiceover with subtle background beat",
      cpa: "₹42 CPA vs ₹91 sibling median",
      roas: "2.9x ROAS",
    },
    whyItWorks:
      "Breaks out early with 2.4x higher hook rate than sibling ads. Strong consumer health trigger dismantles adulteration objections.",
  },
  {
    id: "account-win-3",
    brandName: "Cold-Pressed Discovery Kit",
    adUrl: "https://adsmanager.facebook.com/adsmanager/manage/ads?act=sample_3",
    daysActive: 4,
    startDate: "Nov 1, 2026",
    impressions: 88000,
    versionCount: 2,
    format: "carousel",
    structure: {
      stage: "Potential Winner",
      angle: "Trial Bundle & Risk-Free Offer",
      hook: "Curiosity unboxing: 'Can you tell the difference between 3 cold-pressed oils?'",
      timingBeats: "Card 1: Discovery kit unboxing → Card 2: 3 oil taste profiles → Card 3: Free sampler bottle offer",
      visualPacing: "Sequential swipe progression with unboxing shots",
      cpa: "₹49 CPA vs ₹85 sibling median",
      roas: "3.1x ROAS",
    },
    whyItWorks:
      "Early breakout taking 42% of ad set impression share within 4 days. Low-risk trial bundle drives high click-through rate.",
  },
];

export function WinningAdsTab({
  detailBar,
}: DetailBarTabProps<AdManagerDetailBarData>) {
  const [expandedAdIds, setExpandedAdIds] = useState<Record<string, boolean>>(
    {},
  );

  const rawAds = detailBar.data.winningAds;
  const ads: WinningAd[] =
    rawAds && rawAds.length > 0 ? rawAds : SAMPLE_ACCOUNT_WINNING_ADS;

  const toggleStructure = (id: string) => {
    setExpandedAdIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  if (!ads || ads.length === 0) {
    return (
      <DetailBarEmptyState
        icon={Trophy}
        title="No winning ads yet"
        description="Run an account analysis to detect your top-performing ads and scale proven creative winners."
      />
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {/* Winning Ad Cards */}
      <div className="space-y-3.5">
        {ads.map((ad) => {
          const isExpanded = Boolean(expandedAdIds[ad.id]);
          const structure = ad.structure || {};
          const hook =
            typeof structure.hook === "string" ? structure.hook : undefined;
          const format =
            ad.format ||
            (typeof structure.format === "string" ? structure.format : "static");

          const structureEntries = Object.entries(structure).filter(
            ([k]) => k !== "hook" && k !== "format",
          );

          return (
            <div
              key={ad.id}
              className="rounded-none border border-border bg-card p-4 sm:p-4.5 hover:border-input transition-all flex flex-col space-y-3.5"
            >
              {/* Header: Brand name & Days Active */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {ad.brandLogo ? (
                    <img
                      src={ad.brandLogo}
                      alt={ad.brandName}
                      className="w-8 h-8 rounded-none object-contain bg-muted border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-none bg-secondary text-foreground flex items-center justify-center shrink-0 border border-border">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14.5px] font-bold text-foreground truncate">
                        {ad.brandName}
                      </span>
                      {ad.adUrl && (
                        <a
                          href={ad.adUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                          title="View ad in Ads Manager"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Days Active Pill */}
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-none text-[11.5px] font-medium bg-success-tint text-brand shrink-0 border border-success-tint">
                  <Clock className="w-3 h-3 text-brand" />
                  <span>{ad.daysActive}d active</span>
                </div>
              </div>

              {/* 3 Metric Badges */}
              <div className="grid grid-cols-3 gap-2 py-1">
                {/* Impressions */}
                <div className="bg-muted rounded-none p-2.5 border border-border min-w-0">
                  <div className="flex items-center gap-1 text-[10.5px] font-bold tracking-wider text-muted-foreground uppercase">
                    <Eye className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">Impressions</span>
                  </div>
                  <div className="text-[13px] font-bold text-foreground mt-1 truncate">
                    {formatNumberToK(ad.impressions)}
                  </div>
                </div>

                {/* Versions */}
                <div className="bg-muted rounded-none p-2.5 border border-border min-w-0">
                  <div className="flex items-center gap-1 text-[10.5px] font-bold tracking-wider text-muted-foreground uppercase">
                    <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">Versions</span>
                  </div>
                  <div className="text-[13px] font-bold text-foreground mt-1 truncate">
                    {ad.versionCount !== undefined ? `${ad.versionCount} live` : "-"}
                  </div>
                </div>

                {/* Format */}
                <div className="bg-muted rounded-none p-2.5 border border-border min-w-0">
                  <div className="flex items-center gap-1 text-[10.5px] font-bold tracking-wider text-muted-foreground uppercase">
                    <Film className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">Format</span>
                  </div>
                  <div className="text-[13px] font-bold text-foreground mt-1 truncate capitalize">
                    {format}
                  </div>
                </div>
              </div>

              {/* Opening Hook (inside structure) */}
              {hook && (
                <div className="bg-muted border border-success-tint rounded-none p-2.5 text-[12px] space-y-0.5">
                  <div className="text-[10px] font-bold text-brand uppercase tracking-wider font-mono">
                    Opening Hook
                  </div>
                  <p className="text-foreground italic leading-snug">
                    &ldquo;{hook}&rdquo;
                  </p>
                </div>
              )}

              {/* Why It Works Box */}
              {ad.whyItWorks && (
                <div className="text-[12.5px] text-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Why it works: </span>
                  {ad.whyItWorks}
                </div>
              )}

              {/* Action / Scaling Opportunity Callout */}
              {ad.remakeNotes && (
                <div className="rounded-none bg-muted border border-success-tint p-3 text-[12.5px] text-foreground space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-brand uppercase">
                    <Trophy className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span>Scaling Opportunity</span>
                  </div>
                  <p className="leading-relaxed text-foreground">{ad.remakeNotes}</p>
                </div>
              )}

              {/* Expandable Structure Row */}
              {structureEntries.length > 0 && (
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => toggleStructure(ad.id)}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <span>
                      {isExpanded ? "Hide structure details" : "View structure details"}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-3.5 rounded-none bg-muted border border-border text-[12px] space-y-2 text-foreground animate-in fade-in-50 duration-150">
                      {structureEntries.map(([key, val]) => (
                        <div key={key} className="flex flex-col sm:flex-row sm:gap-2">
                          <span className="font-bold text-foreground capitalize shrink-0 sm:min-w-[110px]">
                            {key.replace(/([A-Z])/g, " $1")}:
                          </span>
                          <span className="text-foreground break-words">
                            {typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Footer: Date & Active Days */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border text-[11.5px] text-muted-foreground font-medium">
                <div className="min-w-0 truncate">
                  {ad.startDate ? `Started ${ad.startDate}` : `Active ${ad.daysActive} days`}
                </div>
                <div className="text-muted-foreground shrink-0">
                  {ad.daysActive}d running
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
