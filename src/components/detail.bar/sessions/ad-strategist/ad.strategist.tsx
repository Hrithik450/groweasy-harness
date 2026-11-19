"use client";

import { useState, useRef, type ComponentType } from "react";
import type {
  DetailBarComponentProps,
  DetailBarTabProps,
  AdStrategistDetailBarData,
} from "@/lib/detail.bar/types";
import { barTabs } from "@/lib/detail.bar/fields";
import { DetailBarHeader } from "../../common";
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
  detailBar,
  isStreaming,
  handleSubmit,
  handleUpdateData,
  handleNavigation,
}: DetailBarComponentProps<AdStrategistDetailBarData>) {
  const tabs = barTabs("adStrategist");
  const [activeTab, setActiveTab] = useState<AdStrategistTabKey>(
    tabs[0]?.key as AdStrategistTabKey,
  );
  const data = detailBar.data;

  const researches = data?.competitorResearches ?? [];

  const initialIdsRef = useRef<Set<string> | null>(null);
  const prevSessionIdRef = useRef<string | undefined>(session?.id);

  if (
    initialIdsRef.current === null ||
    prevSessionIdRef.current !== session?.id
  ) {
    prevSessionIdRef.current = session?.id;
    initialIdsRef.current = new Set(
      researches.map((r, i) => r.turnId || r.createdAt || String(i)),
    );
  }

  const newResearchCount = researches.filter(
    (r, i) =>
      !initialIdsRef.current?.has(r.turnId || r.createdAt || String(i)),
  ).length;

  const badgeCount: Record<string, number> = {
    competitorResearches: newResearchCount,
  };
  const Body = CONTENT[activeTab];

  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Top Header */}
      <DetailBarHeader>
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
          data={data}
          session={session}
          isStreaming={isStreaming}
          handleSubmit={handleSubmit}
          handleUpdateData={handleUpdateData}
          handleNavigation={handleNavigation}
        />
      </div>
    </div>
  );
}
