"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { CampaignAd } from "../../../../../types";

interface CampaignAdCardProps {
  ad: CampaignAd;
  isStreaming?: boolean;
  onAction?: (
    ad: CampaignAd,
    mode: "primary" | "secondary",
  ) => Promise<void> | void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function thumbnailClass(ad: CampaignAd): string {
  if (ad.format === "video" || ad.classification === "winner") {
    return "bg-foreground text-background";
  }
  if (ad.classification === "scaler") {
    return "bg-warning-strong text-foreground";
  }
  if (ad.classification === "loser") {
    return "bg-muted-2 text-background";
  }
  return "bg-border-strong text-foreground";
}

function defaultActionLabel(ad: CampaignAd): string {
  switch (ad.classification) {
    case "winner":
      return "Multiply variants";
    case "scaler":
      return "Increase budget: +20%";
    case "loser":
      return "Stop ad";
    case "untested":
    case "potential":
    default:
      return "Give it a test budget: ₹300/day";
  }
}

export function CampaignAdCard({
  ad,
  isStreaming,
  onAction,
}: CampaignAdCardProps) {
  const [pendingMode, setPendingMode] = useState<
    "primary" | "secondary" | null
  >(null);

  const isProtected =
    ad.classification === "potential" &&
    !ad.actionLabel &&
    !ad.secondaryAction;

  const isVideo = ad.format === "video";
  const thumbnailLabel =
    ad.thumbnailLabel || (isVideo ? "VID" : "IMG");

  const fallbackMetrics: string[] = [];
  if (ad.siblingComparison) fallbackMetrics.push(ad.siblingComparison);
  if (ad.resultShare) fallbackMetrics.push(ad.resultShare);
  if (fallbackMetrics.length === 0) {
    if (ad.cpa) fallbackMetrics.push(`CPA ${ad.cpa}`);
    if (ad.roas) fallbackMetrics.push(`ROAS ${ad.roas}`);
  }

  const metricLines =
    ad.metricLines && ad.metricLines.length > 0
      ? ad.metricLines
      : fallbackMetrics;

  const insight = ad.insight || ad.whyItWorks;
  const primaryLabel = ad.actionLabel || defaultActionLabel(ad);
  const fullWidthPrimary =
    ad.actionFullWidth === true ||
    (ad.classification === "loser" && !ad.secondaryAction);

  const handleAction = async (mode: "primary" | "secondary") => {
    if (isStreaming || pendingMode) return;
    setPendingMode(mode);
    try {
      await onAction?.(ad, mode);
    } finally {
      setPendingMode(null);
    }
  };

  return (
    <article className="border border-border bg-card rounded-none p-3 space-y-2.5">
      <div className="flex items-start gap-3">
        <span
          className={`w-12 h-16 shrink-0 flex items-end justify-start p-1 text-[10px] font-extrabold tracking-wider rounded-none ${thumbnailClass(
            ad,
          )}`}
          aria-hidden="true"
        >
          {thumbnailLabel}
        </span>

        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className="font-bold text-[13px] text-foreground leading-snug break-words">
            {ad.name}
          </h4>

          {metricLines.map((line) => (
            <p
              key={line}
              className="text-[12px] text-foreground leading-snug break-words"
            >
              {line}
            </p>
          ))}

          {insight && (
            <p className="text-[12px] text-muted-foreground leading-snug break-words">
              {insight}
            </p>
          )}
        </div>
      </div>

      {isProtected ? (
        <div className="flex items-center">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-1 rounded-none">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Protected while it proves out</span>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAction("primary")}
            disabled={Boolean(isStreaming || pendingMode)}
            className={`min-h-9 px-3 py-1.5 bg-brand hover:bg-brand-hover text-primary-foreground rounded-none text-[12px] font-bold leading-snug text-center break-words transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
              fullWidthPrimary ? "w-full" : ""
            } ${FOCUS_RING}`}
          >
            {pendingMode === "primary" ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  aria-hidden="true"
                />
                <span>Working...</span>
              </span>
            ) : (
              <span>{primaryLabel}</span>
            )}
          </button>

          {ad.secondaryAction && (
            <button
              type="button"
              onClick={() => handleAction("secondary")}
              disabled={Boolean(isStreaming || pendingMode)}
              className={`min-h-9 px-3 py-1.5 border border-input bg-card text-foreground hover:bg-muted rounded-none text-[12px] font-semibold leading-snug break-words transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`}
            >
              {pendingMode === "secondary" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  <span>Working...</span>
                </span>
              ) : (
                <span>{ad.secondaryAction.label}</span>
              )}
            </button>
          )}

          {ad.savings && (
            <span className="text-[12px] font-bold text-success leading-snug break-words">
              {ad.savings}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
