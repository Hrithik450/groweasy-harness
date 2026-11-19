"use client";

import { useState, useEffect } from "react";
import {
  RefreshCw,
  Loader2,
  Megaphone,
  Clock,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { MetaAd } from "@/lib/connectors/meta.ads/types";

interface MetaAdsSubTabProps {
  selectedAccountId: string;
}

export function MetaAdsSubTab({ selectedAccountId }: MetaAdsSubTabProps) {
  const [ads, setAds] = useState<MetaAd[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLiveAds = async () => {
    if (!selectedAccountId) return;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/connectors/meta.ads/ad-accounts/campaigns/adsets/ads?adAccountId=${encodeURIComponent(
          selectedAccountId,
        )}`,
      );

      const data = await res.json();
      if (res.ok && data.success) {
        const items: MetaAd[] = data.ads || data.data || [];
        setAds(items);
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to load Meta ads";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("Error connecting to Meta ads endpoint");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveAds();
  }, [selectedAccountId]);

  return (
    <div className="space-y-3">
      {/* Sub-tab Action Bar */}
      <div className="h-8 w-full flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            Ads
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-linen border border-border/80 shadow-2xs">
            {ads.length} {ads.length === 1 ? "Ad" : "Ads"}
          </span>
        </div>

        <button
          type="button"
          onClick={fetchLiveAds}
          disabled={isLoading}
          className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground bg-card hover:bg-linen rounded-lg border border-border transition-colors cursor-pointer shadow-2xs"
          title="Refresh ads"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isLoading ? "animate-spin text-forest" : ""
            }`}
          />
        </button>
      </div>

      {/* Ads Listing */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-2 space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-forest" />
          <span className="text-xs">Fetching ads from Meta Graph API...</span>
        </div>
      ) : ads.length === 0 ? (
        <div className="p-5 sm:p-6 border border-border/80 rounded-2xl bg-linen text-center space-y-2 shadow-2xs">
          <Megaphone className="w-6 h-6 text-muted-2 mx-auto" />
          <h4 className="text-sm font-semibold text-foreground">
            No Ads Found
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            No creatives or individual ads were found on this account. Create
            ads directly in Meta Ads Manager.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ads.map((ad) => {
            const creative = ad.creative;
            const dateStr = ad.createdTime;

            return (
              <div
                key={ad.id}
                className="bg-card border border-border/80 hover:border-border-strong rounded-2xl p-3 sm:p-3.5 transition-all space-y-2.5 shadow-2xs w-full"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {creative?.mediaUrl ? (
                      <img
                        src={creative.mediaUrl}
                        alt={ad.name || "Ad creative"}
                        className="w-12 h-12 rounded-lg object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-linen border border-border flex items-center justify-center text-muted-2 shrink-0">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-foreground leading-snug truncate">
                        {ad.name}
                      </h4>
                      {ad.id && (
                        <span className="text-xs text-muted-foreground font-mono block">
                          ID: {ad.id}
                        </span>
                      )}
                      {creative?.primaryText && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {creative.primaryText}
                        </p>
                      )}
                    </div>
                  </div>

                  {ad.status && (
                    <span
                      className={`px-2.5 py-0.5 rounded-none text-[11px] font-semibold shrink-0 ${
                        ad.status === "ACTIVE"
                          ? "bg-success-tint text-success border border-success-border"
                          : ad.status === "PAUSED"
                            ? "bg-warning-tint text-warning border border-warning-border"
                            : "bg-muted text-foreground border border-border"
                      }`}
                    >
                      {ad.status}
                    </span>
                  )}
                </div>

                {dateStr && (
                  <div className="flex items-center gap-1.5 text-muted-2 text-xs pt-1 border-t border-border-subtle">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Created:{" "}
                      {new Date(dateStr).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
