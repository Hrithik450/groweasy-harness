"use client";

import { useState } from "react";
import type {
  DetailBarComponentProps,
  AdManagerDetailBarData,
} from "../../../types";
import { DetailBarHeader } from "../../common";
import { CampaignsTab, AlertsTab, SuggestionsTab } from "./tabs";
import type { AdManagerTabKey } from "./types";

const TAB_BASE =
  "h-full flex items-center text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function AdManagerDetailBar({
  session,
  detailBar,
  isStreaming,
  handleSubmit,
  handleUpdateData,
  handleNavigation,
}: DetailBarComponentProps<AdManagerDetailBarData>) {
  const [activeTab, setActiveTab] = useState<AdManagerTabKey>("campaigns");

  // The projection starts empty for a session no tool has written yet, so
  // every list is optional at runtime even though the bar reads it as a family.
  const alerts = detailBar.data.alerts ?? [];
  const suggestions = detailBar.data.suggestions ?? [];

  const alertsCount = alerts.filter(
    (alert) => alert.status === "pending",
  ).length;

  const suggestionsCount = suggestions.filter(
    (suggestion) => (suggestion.status ?? "pending") !== "completed",
  ).length;

  return (
    <div className="relative flex flex-col h-full bg-card select-none">
      {/* Top Header with Tab Switcher */}
      <DetailBarHeader>
        <div
          role="tablist"
          aria-label="Ad manager"
          className="w-full flex items-center gap-5 h-full overflow-x-auto no-scrollbar scroll-smooth"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "campaigns"}
            onClick={() => setActiveTab("campaigns")}
            className={`${TAB_BASE} ${
              activeTab === "campaigns"
                ? "font-bold text-foreground border-brand"
                : "font-medium text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            Campaigns
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "alerts"}
            onClick={() => setActiveTab("alerts")}
            className={`${TAB_BASE} gap-1.5 ${
              activeTab === "alerts"
                ? "font-bold text-foreground border-brand"
                : "font-medium text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            <span>Alerts</span>
            {alertsCount > 0 && (
              <span className="w-5 h-5 rounded-none bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
                {alertsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "suggestions"}
            onClick={() => setActiveTab("suggestions")}
            className={`${TAB_BASE} gap-1.5 ${
              activeTab === "suggestions"
                ? "font-bold text-foreground border-brand"
                : "font-medium text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            <span>Suggestions</span>
            {suggestionsCount > 0 && (
              <span className="w-5 h-5 rounded-none bg-brand text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
                {suggestionsCount}
              </span>
            )}
          </button>
        </div>
      </DetailBarHeader>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 pt-3">
        {activeTab === "campaigns" && (
          <CampaignsTab
            session={session}
            detailBar={detailBar}
            isStreaming={isStreaming}
            handleSubmit={handleSubmit}
            handleUpdateData={handleUpdateData}
            handleNavigation={handleNavigation}
          />
        )}
        {activeTab === "alerts" && (
          <AlertsTab
            session={session}
            detailBar={detailBar}
            isStreaming={isStreaming}
            handleSubmit={handleSubmit}
            handleUpdateData={handleUpdateData}
            handleNavigation={handleNavigation}
          />
        )}
        {activeTab === "suggestions" && (
          <SuggestionsTab
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
