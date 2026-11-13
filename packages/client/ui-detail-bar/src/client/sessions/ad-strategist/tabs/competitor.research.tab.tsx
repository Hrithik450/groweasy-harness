"use client";

import {
  Compass,
  Users2,
  Sparkles,
  MessageSquare,
  ArrowUpRight,
  Tag,
} from "lucide-react";
import type {
  DetailBarTabProps,
  AdStrategistDetailBarData,
  CompetitorResearchItem,
} from "../../../../types";
import {
  useBusinessProfile,
  useDetailBar,
  useSessionStore,
  normalizeDomainOrUrl,
} from "@openai-harness/client-ui-session";
import { DetailBarEmptyState } from "../../../common";

/**
 * The competitor-research tab.
 *
 * Research is brand-level memory held on the canonical Ad Strategist session,
 * not on whichever chat is open: a run started from another chat or from the
 * Ad Creator appends there, and this tab reads that session's projection so
 * the cards survive switching chats and reloading. Only when that session
 * does not exist yet does it fall back to the current bar.
 */
export function CompetitorResearchTab(
  props: DetailBarTabProps<AdStrategistDetailBarData>,
) {
  const canonicalId = useSessionStore(
    (state) =>
      state.sessions.find((session) => session.slug === "adStrategist")?.id,
  );

  if (canonicalId === undefined) {
    return <CompetitorResearchList {...props} />;
  }
  return (
    <CanonicalCompetitorResearchList canonicalId={canonicalId} {...props} />
  );
}

/** Read the canonical Ad Strategist bar and render it in place of the current one. */
function CanonicalCompetitorResearchList({
  canonicalId,
  detailBar,
  ...rest
}: DetailBarTabProps<AdStrategistDetailBarData> & { canonicalId: string }) {
  const canonical = useDetailBar(canonicalId);
  const canonicalData =
    canonical.data as unknown as AdStrategistDetailBarData;

  return (
    <CompetitorResearchList
      {...rest}
      detailBar={{
        type: detailBar.type,
        data: {
          ...detailBar.data,
          competitorResearches: canonicalData.competitorResearches,
        },
      }}
    />
  );
}

function CompetitorResearchList({
  detailBar,
  handleNavigation,
}: DetailBarTabProps<AdStrategistDetailBarData>) {
  const { connector } = useBusinessProfile();
  const brandUrl = (connector?.metadata as { url?: string })?.url;
  const isConnected = connector?.status === "connected" && Boolean(brandUrl);

  const activeBrandDomain = normalizeDomainOrUrl(brandUrl);
  const researches: CompetitorResearchItem[] =
    detailBar.data.competitorResearches ?? [];

  const filteredResearches = activeBrandDomain
    ? researches.filter((item) => {
        if (!item.brandUrl) return false;
        return normalizeDomainOrUrl(item.brandUrl) === activeBrandDomain;
      })
    : [];

  if (filteredResearches.length === 0) {
    if (!isConnected || !brandUrl) {
      return (
        <DetailBarEmptyState
          icon={Compass}
          title="No Business Profile Connected"
          description="Connect your business profile to view competitive research and winning ad strategies for your brand."
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
        {filteredResearches.map((item, index) => {
          const dateStr = new Date(item.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={item.messageId || index}
              onClick={() => {
                if (item.messageId) {
                  handleNavigation?.(item.messageId);
                }
              }}
              className="group relative rounded-none p-4 border border-border bg-card hover:border-input transition-colors cursor-pointer"
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
                    <Users2 className="w-3 h-3 text-muted-foreground" />
                    <span>Competitors Discovered</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.newCompetitors.map((comp) => (
                      <span
                        key={comp}
                        className="inline-flex items-center text-[11px] font-medium bg-secondary text-foreground border border-border px-2 py-0.5 rounded-none"
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
                    <Tag className="w-3 h-3 text-muted-foreground" />
                    <span>Keywords Discovered</span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
                    {item.newKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center text-[11px] font-medium bg-secondary text-foreground border border-border px-2 py-0.5 rounded-none shrink-0"
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
                    <Sparkles className="w-3 h-3 text-muted-foreground" />
                    <span>Ads Discovered</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.newAds?.staticAds &&
                      item.newAds.staticAds.length > 0 && (
                        <span className="inline-flex items-center text-[11px] font-medium bg-secondary text-foreground border border-border px-2 py-0.5 rounded-none">
                          {item.newAds.staticAds.length} Static{" "}
                          {item.newAds.staticAds.length === 1 ? "Ad" : "Ads"}
                        </span>
                      )}
                    {item.newAds?.videoAds &&
                      item.newAds.videoAds.length > 0 && (
                        <span className="inline-flex items-center text-[11px] font-medium bg-secondary text-foreground border border-border px-2 py-0.5 rounded-none">
                          {item.newAds.videoAds.length} Video{" "}
                          {item.newAds.videoAds.length === 1 ? "Ad" : "Ads"}
                        </span>
                      )}
                  </div>
                </div>
              )}

              {/* Footer: Jump to chat */}
              <div className="flex items-center justify-end pt-2.5 border-t border-border">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.messageId) {
                      handleNavigation?.(item.messageId);
                    }
                  }}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover:text-brand transition-colors shrink-0 cursor-pointer active:scale-95"
                >
                  <MessageSquare className="w-3 h-3 text-muted-foreground group-hover:text-brand" />
                  <span>Jump to chat</span>
                  <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
