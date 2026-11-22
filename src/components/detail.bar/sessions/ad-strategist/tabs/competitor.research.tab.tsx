"use client";

import { Compass, Users2, Sparkles, Tag } from "lucide-react";
import type {
  DetailBarTabProps,
  AdStrategistDetailBarData,
  CompetitorResearchItem,
} from "@/lib/detail.bar/types";
import { useBusinessProfile } from "@/hooks/use.business.profile";
import { useBarPager } from "@/hooks/use.bar.pager";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
  DetailBarViewLink,
} from "@/components/detail.bar/common";

export function CompetitorResearchTab({
  session,
}: DetailBarTabProps<AdStrategistDetailBarData>) {
  const { connector } = useBusinessProfile();
  const brandUrl = (connector?.metadata as { url?: string })?.url;
  const isConnected = connector?.status === "connected" && Boolean(brandUrl);

  const pager = useBarPager<CompetitorResearchItem>(
    session?.id,
    "competitorResearches",
  );
  const items = pager.items;

  if (items.length === 0) {
    if (!isConnected || !brandUrl) {
      return (
        <DetailBarEmptyState
          icon={Compass}
          title="No Brand Brain Connected"
          description="Connect your Brand Brain to view competitive research and winning ad strategies for your brand."
        />
      );
    }

    return (
      <DetailBarEmptyState
        icon={Compass}
        title="No Competitor Research Yet"
        description={`Ask the assistant to run competitive research on Meta ads for ${brandUrl} to reveal rivals, winning angles, and creative strategies.`}
      />
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {/* Cards Stream */}
      <div className="space-y-3">
        {items.map((item) => {
          const dateStr = new Date(item.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const hasSpec = Boolean(item.blocks);

          return (
            <div
              key={item.id}
              className="group relative rounded-2xl p-4 border border-border bg-card hover:border-brand/40 hover:shadow-sm transition-all shadow-2xs"
            >
              {/* Top Row: Title + Date */}
              <div className="flex items-start justify-between gap-2.5 mb-2">
                <h4 className="font-bold text-[14px] text-foreground tracking-tight leading-snug truncate group-hover:text-brand transition-colors min-w-0">
                  {item.title}
                </h4>
                <span className="text-[11px] font-medium text-muted-foreground shrink-0 font-mono pt-0.5">
                  {dateStr}
                </span>
              </div>

              {/* Content Preview */}
              <p className="text-[12.5px] text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                {item.content}
              </p>

              {/* 1. Competitors Discovered Tags */}
              {item.newCompetitors && item.newCompetitors.length > 0 && (
                <div className="mb-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mb-1.5">
                    <Users2 className="w-3 h-3 text-muted-2" />
                    <span>Competitors Discovered</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.newCompetitors.map((comp) => (
                      <span
                        key={comp}
                        className="inline-flex items-center text-[11px] font-medium bg-muted/90 text-foreground border border-border/70 px-2 py-0.5 rounded-md"
                      >
                        {comp}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Keywords Tags (clamped to 1 line) */}
              {item.newKeywords && item.newKeywords.length > 0 && (
                <div className="mb-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mb-1.5">
                    <Tag className="w-3 h-3 text-muted-2" />
                    <span>Keywords Discovered</span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
                    {item.newKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center text-[11px] font-medium bg-muted/90 text-foreground border border-border/70 px-2 py-0.5 rounded-md shrink-0"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Ads Discovered Tags (3rd Sequence) */}
              {((item.newAds?.staticAds && item.newAds.staticAds.length > 0) ||
                (item.newAds?.videoAds && item.newAds.videoAds.length > 0)) && (
                <div className="mb-3">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mb-1.5">
                    <Sparkles className="w-3 h-3 text-muted-2" />
                    <span>Ads Discovered</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.newAds?.staticAds &&
                      item.newAds.staticAds.length > 0 && (
                        <span className="inline-flex items-center text-[11px] font-medium bg-muted/90 text-foreground border border-border/70 px-2 py-0.5 rounded-md">
                          {item.newAds.staticAds.length} Static{" "}
                          {item.newAds.staticAds.length === 1 ? "Ad" : "Ads"}
                        </span>
                      )}
                    {item.newAds?.videoAds &&
                      item.newAds.videoAds.length > 0 && (
                        <span className="inline-flex items-center text-[11px] font-medium bg-muted/90 text-foreground border border-border/70 px-2 py-0.5 rounded-md">
                          {item.newAds.videoAds.length} Video{" "}
                          {item.newAds.videoAds.length === 1 ? "Ad" : "Ads"}
                        </span>
                      )}
                  </div>
                </div>
              )}

              {/* Footer: open the saved page when one exists. */}
              {hasSpec ? (
                <div className="flex items-center justify-end pt-2.5 border-t border-border-subtle">
                  <DetailBarViewLink
                    href={`/c/${session?.id ?? ""}/research/${encodeURIComponent(item.id)}`}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}
