"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { RefreshCw, Loader2, Layers, Coins, Target } from "lucide-react";
import type { MetaAdSet } from "@/lib/connectors/meta.ads/types";

interface MetaAdSetsSubTabProps {
  selectedAccountId: string;
  adAccountCurrency?: string;
}

export function MetaAdSetsSubTab({
  selectedAccountId,
  adAccountCurrency,
}: MetaAdSetsSubTabProps) {
  const [adSets, setAdSets] = useState<MetaAdSet[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const currencySymbol = adAccountCurrency === "INR" ? "₹" : "$";

  const fetchLiveAdSets = async () => {
    if (!selectedAccountId) return;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/connectors/meta.ads/ad-accounts/campaigns/adsets?adAccountId=${encodeURIComponent(
          selectedAccountId,
        )}`,
      );

      const data = await res.json();
      if (res.ok && data.success) {
        const items: MetaAdSet[] = data.adsets || data.data || [];
        setAdSets(items);
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to load Meta ad sets";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("Error connecting to Meta ad sets endpoint");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveAdSets();
  }, [selectedAccountId]);

  return (
    <div className="space-y-3">
      {/* Sub-tab Action Bar */}
      <div className="h-8 w-full flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">Ad Sets</span>
          <span className="shrink-0 text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-linen border border-border/80 shadow-2xs">
            {adSets.length} {adSets.length === 1 ? "Ad Set" : "Ad Sets"}
          </span>
        </div>

        <button
          type="button"
          onClick={fetchLiveAdSets}
          disabled={isLoading}
          className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground bg-card hover:bg-linen rounded-lg border border-border transition-colors cursor-pointer shadow-2xs"
          title="Refresh ad sets"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isLoading ? "animate-spin text-forest" : ""
            }`}
          />
        </button>
      </div>

      {/* Ad Sets Listing */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-2 space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-forest" />
          <span className="text-xs">
            Fetching ad sets from Meta Graph API...
          </span>
        </div>
      ) : adSets.length === 0 ? (
        <div className="p-5 sm:p-6 border border-border/80 rounded-2xl bg-linen text-center space-y-2 shadow-2xs">
          <Layers className="w-6 h-6 text-muted-2 mx-auto" />
          <h4 className="text-sm font-semibold text-foreground">
            No Ad Sets Found
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            No active or paused ad sets were found on this ad account. Create an
            ad set under a campaign in Meta Ads Manager.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {adSets.map((adSet) => {
            const budget = adSet.dailyBudget
              ? `${currencySymbol}${adSet.dailyBudget.toLocaleString("en-IN")}/day`
              : adSet.lifetimeBudget
                ? `${currencySymbol}${adSet.lifetimeBudget.toLocaleString("en-IN")} lifetime`
                : null;

            return (
              <div
                key={adSet.id}
                className="bg-card border border-border/80 hover:border-border-strong rounded-2xl p-3 sm:p-3.5 transition-all space-y-2.5 shadow-2xs w-full"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground leading-snug truncate">
                      {adSet.name}
                    </h4>
                    {adSet.id && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ID: {adSet.id}
                      </span>
                    )}
                  </div>

                  {adSet.status && (
                    <span
                      className={`px-2.5 py-0.5 rounded-none text-[11px] font-semibold shrink-0 ${
                        adSet.status === "ACTIVE"
                          ? "bg-success-tint text-success border border-success-border"
                          : adSet.status === "PAUSED"
                            ? "bg-warning-tint text-warning border border-warning-border"
                            : "bg-muted text-foreground border border-border"
                      }`}
                    >
                      {adSet.status}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t border-border-subtle flex-wrap">
                  {adSet.optimizationGoal && (
                    <div className="flex items-center gap-1 text-foreground font-medium">
                      <Target className="w-3.5 h-3.5 text-muted-2" />
                      <span>{adSet.optimizationGoal.replace(/_/g, " ")}</span>
                    </div>
                  )}

                  {budget && (
                    <div className="flex items-center gap-1.5 text-foreground font-semibold">
                      <Coins className="w-3.5 h-3.5 text-forest" />
                      <span>{budget}</span>
                    </div>
                  )}

                  {adSet.billingEvent && (
                    <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] text-muted-foreground ml-auto">
                      {adSet.billingEvent}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
