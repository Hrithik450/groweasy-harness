"use client";

import { useState, useRef } from "react";
import type {
  DetailBarComponentProps,
  AdStrategistDetailBarData,
} from "../../../types";
import { DetailBarHeader } from "../../common";
import { ReportsTab, BriefsTab, CompetitorResearchTab } from "./tabs";
import type { AdStrategistTabKey } from "./types";
import {
  useBusinessProfile,
  normalizeDomainOrUrl,
} from "@openai-harness/client-ui-session";

export function AdStrategistDetailBar({
  session,
  detailBar,
  isStreaming,
  handleSubmit,
  handleUpdateData,
  handleNavigation,
}: DetailBarComponentProps<AdStrategistDetailBarData>) {
  const [activeTab, setActiveTab] = useState<AdStrategistTabKey>("reports");

  const { connector } = useBusinessProfile();
  const brandUrl = (connector?.metadata as { url?: string })?.url;
  const activeBrandDomain = normalizeDomainOrUrl(brandUrl);

  const researches = detailBar.data.competitorResearches ?? [];

  const brandResearches = activeBrandDomain
    ? researches.filter((item) => {
        if (!item.brandUrl) return false;
        return normalizeDomainOrUrl(item.brandUrl) === activeBrandDomain;
      })
    : [];

  const initialIdsRef = useRef<Set<string> | null>(null);
  const prevSessionIdRef = useRef<string | undefined>(session?.id);

  if (
    initialIdsRef.current === null ||
    prevSessionIdRef.current !== session?.id
  ) {
    prevSessionIdRef.current = session?.id;
    initialIdsRef.current = new Set(
      researches.map((r, i) => r.messageId || r.createdAt || String(i)),
    );
  }

  const newResearchCount = brandResearches.filter(
    (r, i) =>
      !initialIdsRef.current?.has(r.messageId || r.createdAt || String(i)),
  ).length;

  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Top Header */}
      <DetailBarHeader>
        <div
          role="tablist"
          aria-label="Ad strategist"
          className="w-full flex items-center gap-5 h-full overflow-x-auto no-scrollbar scroll-smooth"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "reports"}
            onClick={() => setActiveTab("reports")}
            className={`h-full flex items-center text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              activeTab === "reports"
                ? "font-bold text-foreground border-brand"
                : "font-medium text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            Daily reports
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "briefs"}
            onClick={() => setActiveTab("briefs")}
            className={`h-full flex items-center gap-1.5 text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              activeTab === "briefs"
                ? "font-bold text-foreground border-brand"
                : "font-medium text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            <span>Campaign brief</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "research"}
            onClick={() => setActiveTab("research")}
            className={`h-full flex items-center gap-1.5 text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              activeTab === "research"
                ? "font-bold text-foreground border-brand"
                : "font-medium text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            <span>Competitor research</span>
            {newResearchCount > 0 && (
              <span className="w-5 h-5 rounded-none bg-brand text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
                {newResearchCount}
              </span>
            )}
          </button>
        </div>
      </DetailBarHeader>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        {activeTab === "reports" && (
          <ReportsTab
            session={session}
            detailBar={detailBar}
            isStreaming={isStreaming}
            handleSubmit={handleSubmit}
            handleUpdateData={handleUpdateData}
          />
        )}

        {activeTab === "briefs" && (
          <BriefsTab
            session={session}
            detailBar={detailBar}
            isStreaming={isStreaming}
            handleSubmit={handleSubmit}
            handleUpdateData={handleUpdateData}
            handleNavigation={handleNavigation}
          />
        )}

        {activeTab === "research" && (
          <CompetitorResearchTab
            session={session}
            detailBar={detailBar}
            isStreaming={isStreaming}
            handleSubmit={handleSubmit}
            handleUpdateData={handleUpdateData}
            handleNavigation={handleNavigation}
          />
        )}
      </div>
    </div>
  );
}
