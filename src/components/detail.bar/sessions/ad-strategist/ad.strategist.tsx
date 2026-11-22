"use client";

import { useState, useRef, type ComponentType } from "react";
import type {
  CompetitorResearchItem,
  DetailBarComponentProps,
  DetailBarTabProps,
  AdStrategistDetailBarData,
} from "@/lib/detail.bar/types";
import { useBarPager } from "@/hooks/use.bar.pager";
import { DetailBarHeader, DetailBarRefresh } from "../../common";
import {
  ReportsTab,
  CampaignBriefsTab,
  CompetitorResearchTab,
} from "./tabs";
import type { AdStrategistTabKey } from "./types";

const TAB_BASE =
  "h-full flex items-center text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/** One body per configured tab; the config decides which tabs exist. */
const CONTENT: Record<
  AdStrategistTabKey,
  ComponentType<DetailBarTabProps<AdStrategistDetailBarData>>
> = {
  reports: ReportsTab,
  competitorResearches: CompetitorResearchTab,
  campaignBriefs: CampaignBriefsTab,
};

export function AdStrategistDetailBar({
  session,
  isStreaming,
  handleSubmit,
  handleUpdateData,
}: DetailBarComponentProps<AdStrategistDetailBarData>) {
  const tabs = [
    { key: "reports", label: "Daily reports" },
    { key: "competitorResearches", label: "Competitor research" },
    { key: "campaignBriefs", label: "Campaign brief" },
  ] as const;
  const [activeTab, setActiveTab] = useState<AdStrategistTabKey>(
    tabs[0]?.key as AdStrategistTabKey,
  );


  // Live page, so the new-research badge follows SSE updates.
  const pager = useBarPager<CompetitorResearchItem>(
    session?.id,
    "competitorResearches",
  );
  const researches = pager.items;

  // Baseline is taken from the seeded page, never from a pre-hydration frame.
  const initialIdsRef = useRef<Set<string> | null>(null);
  const prevSessionIdRef = useRef<string | undefined>(session?.id);

  if (prevSessionIdRef.current !== session?.id) {
    prevSessionIdRef.current = session?.id;
    initialIdsRef.current = null;
  }
  if (initialIdsRef.current === null && pager.hydrated) {
    initialIdsRef.current = new Set(researches.map((r) => r.id));
  }

  const newResearchCount = researches.filter(
    (r) => !initialIdsRef.current?.has(r.id),
  ).length;

  const badgeCount: Record<string, number> = {
    competitorResearches: newResearchCount,
  };
  const Body = CONTENT[activeTab];
  const activeLabel =
    tabs.find((tab) => tab.key === activeTab)?.label ?? "Daily reports";

  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Top Header */}
      <DetailBarHeader
        action={
          <DetailBarRefresh
            sessionId={session?.id}
            field={activeTab}
            label={activeLabel}
            showLabel
          />
        }
      >
        <div
          role="tablist"
          aria-label="Ad strategist"
          className="w-full flex items-center gap-5 h-full overflow-x-auto no-scrollbar scroll-smooth"
        >
          {tabs.map((tab) => {
            const key = tab.key as AdStrategistTabKey;
            const count = badgeCount[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className={`${TAB_BASE} ${count > 0 ? "gap-1.5" : ""} ${
                  activeTab === key
                    ? "font-bold text-foreground border-brand"
                    : "font-medium text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className="w-5 h-5 rounded-none bg-brand text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DetailBarHeader>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        <Body
          session={session}
          isStreaming={isStreaming}
          handleSubmit={handleSubmit}
          handleUpdateData={handleUpdateData}
        />
      </div>
    </div>
  );
}
