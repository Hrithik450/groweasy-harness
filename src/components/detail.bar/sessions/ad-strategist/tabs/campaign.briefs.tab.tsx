"use client";

import { FileText } from "lucide-react";
import { useBarPager } from "@/hooks/use.bar.pager";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
  DetailBarViewLink,
} from "@/components/detail.bar/common";
import type {
  AdStrategistDetailBarData,
  CampaignBrief,
  DetailBarTabProps,
} from "@/lib/detail.bar/types";

/** Stored date for a brief; the label is the fallback for legacy rows. */
function briefDate(brief: CampaignBrief): string | undefined {
  if (brief.createdAt) {
    const parsed = new Date(brief.createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  }
  return undefined;
}

/** Saved campaign briefs; rows with a saved page open their own route. */
export function CampaignBriefsTab({
  session,
}: DetailBarTabProps<AdStrategistDetailBarData>) {
  const pager = useBarPager<CampaignBrief>(session?.id, "campaignBriefs");

  if (pager.items.length === 0) {
    return (
      <DetailBarEmptyState
        icon={FileText}
        title="No Campaign Briefs Yet"
        description="Ask the assistant to draft a campaign brief for your brand. Saved briefs appear here and stay after a reload."
      />
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {pager.items.map((brief) => {
        const hasSpec = Boolean(brief.blocks);

        return (
          <article
            key={brief.id}
            className="group relative rounded-2xl p-4 border border-border bg-card hover:border-brand/40 hover:shadow-sm transition-all shadow-2xs"
          >
            {/* Top Row: Title + Date */}
            <div className="flex items-start justify-between gap-2.5 mb-2">
              <h4 className="font-bold text-[14px] text-foreground tracking-tight leading-snug truncate group-hover:text-brand transition-colors min-w-0">
                {brief.title}
              </h4>
              <span className="text-[11px] font-medium text-muted-foreground shrink-0 font-mono pt-0.5">
                {briefDate(brief)}
              </span>
            </div>

            {/* Content Preview */}
            {brief.summary ? (
              <p className="text-[12.5px] text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                {brief.summary}
              </p>
            ) : null}

            {/* Footer: open the saved page when one exists. */}
            {hasSpec ? (
              <div className="flex items-center justify-end pt-2.5 border-t border-border-subtle">
                <DetailBarViewLink
                  href={`/c/${session?.id ?? ""}/briefs/${encodeURIComponent(brief.id)}`}
                />
              </div>
            ) : null}
          </article>
        );
      })}

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}
