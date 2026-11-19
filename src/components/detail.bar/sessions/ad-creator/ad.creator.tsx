"use client";

import { useState, type ComponentType } from "react";
import type {
  DetailBarComponentProps,
  DetailBarTabProps,
  AdCreatorDetailBarData,
} from "@/lib/detail.bar/types";
import { barTabs } from "@/lib/detail.bar/fields";
import { DetailBarHeader } from "../../common";
import { IdeasTab, CreativesTab } from "./tabs";
import type { AdCreatorTabKey } from "./types";

const TAB_BASE =
  "h-full flex items-center text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/** One body per configured tab; the config decides which tabs exist. */
const CONTENT: Record<
  AdCreatorTabKey,
  ComponentType<DetailBarTabProps<AdCreatorDetailBarData>>
> = {
  ideas: IdeasTab,
  creatives: CreativesTab,
};

export function AdCreatorDetailBar({
  session,
  detailBar,
  isStreaming,
  handleSubmit,
  handleNavigation,
}: DetailBarComponentProps<AdCreatorDetailBarData>) {
  const tabs = barTabs("adCreator");
  const [activeTab, setActiveTab] = useState<AdCreatorTabKey>(
    tabs[0]?.key as AdCreatorTabKey,
  );

  const barData = detailBar.data;
  const Body = CONTENT[activeTab];

  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Top Header with Tab Switcher */}
      <DetailBarHeader>
        <div
          role="tablist"
          aria-label="Ad creator"
          className="w-full flex items-center gap-5 h-full overflow-x-auto no-scrollbar scroll-smooth"
        >
          {tabs.map((tab) => {
            const key = tab.key as AdCreatorTabKey;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className={`${TAB_BASE} ${
                  activeTab === key
                    ? "font-bold text-foreground border-brand"
                    : "font-medium text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </DetailBarHeader>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        <Body
          data={barData}
          session={session}
          isStreaming={isStreaming}
          handleSubmit={handleSubmit}
          handleNavigation={handleNavigation}
        />
      </div>
    </div>
  );
}
