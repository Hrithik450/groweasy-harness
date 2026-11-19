"use client";

import { FileText, MessageSquare, ArrowUpRight } from "lucide-react";
import { useBarPager } from "@/hooks/use.bar.pager";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
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

/** Saved campaign briefs; only briefs written in this session are jumpable. */
export function CampaignBriefsTab({
  session,
  data,
  handleNavigation,
}: DetailBarTabProps<AdStrategistDetailBarData>) {
  const pager = useBarPager(
    session?.id ?? "",
    "campaignBriefs",
    data?.campaignBriefs ?? [],
  );

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
        const canJump =
          brief.sourceSessionId === session?.id && Boolean(brief.turnId);
        const jump = () => {
          if (canJump && brief.turnId) {
            handleNavigation?.(brief.turnId);
          }
        };

        return (
          <article
            key={brief.id}
            onClick={canJump ? jump : undefined}
            className={`group relative rounded-2xl p-4 border border-border bg-card hover:border-brand/40 hover:shadow-sm transition-all shadow-2xs ${
              canJump ? "cursor-pointer" : ""
            }`}
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

            {/* Footer: Jump to chat (same-session briefs only) */}
            {canJump && (
              <div className="flex items-center justify-end pt-2.5 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    jump();
                  }}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover:text-brand transition-colors shrink-0 cursor-pointer active:scale-95"
                >
                  <MessageSquare className="w-3 h-3 text-muted-2 group-hover:text-brand" />
                  <span>Jump to chat</span>
                  <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            )}
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
