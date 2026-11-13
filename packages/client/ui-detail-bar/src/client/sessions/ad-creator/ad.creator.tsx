"use client";

import { useState } from "react";
import type {
  DetailBarComponentProps,
  AdCreatorDetailBarData,
} from "../../../types";
import { DetailBarHeader } from "../../common";
import { IdeasTab, CreativesTab } from "./tabs";
import type { AdCreatorTabKey } from "./types";

export function AdCreatorDetailBar({
  session,
  detailBar,
  isStreaming,
  handleSubmit,
  handleUpdateData,
  handleNavigation,
}: DetailBarComponentProps<AdCreatorDetailBarData>) {
  const [activeTab, setActiveTab] = useState<AdCreatorTabKey>("ideas");

  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Top Header with Tab Switcher */}
      <DetailBarHeader>
        <div
          role="tablist"
          aria-label="Ad creator"
          className="w-full flex items-center gap-5 h-full overflow-x-auto no-scrollbar scroll-smooth"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ideas"}
            onClick={() => setActiveTab("ideas")}
            className={`h-full flex items-center text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              activeTab === "ideas"
                ? "font-bold text-foreground border-brand"
                : "font-medium text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            Ideas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "creatives"}
            onClick={() => setActiveTab("creatives")}
            className={`h-full flex items-center text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              activeTab === "creatives"
                ? "font-bold text-foreground border-brand"
                : "font-medium text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            Creatives
          </button>
        </div>
      </DetailBarHeader>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        {activeTab === "ideas" && (
          <IdeasTab
            session={session}
            detailBar={detailBar}
            isStreaming={isStreaming}
            handleSubmit={handleSubmit}
            handleUpdateData={handleUpdateData}
            handleNavigation={handleNavigation}
          />
        )}
        {activeTab === "creatives" && (
          <CreativesTab
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
