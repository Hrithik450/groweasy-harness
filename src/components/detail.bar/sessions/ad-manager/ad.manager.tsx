"use client";

import { useState } from "react";
import type {
  Alert,
  DetailBarComponentProps,
  AdManagerDetailBarData,
  Suggestion,
} from "@/lib/detail.bar/types";
import { useBarPager } from "@/hooks/use.bar.pager";
import { DetailBarHeader, DetailBarRefresh } from "../../common";
import { AlertsTab, CampaignsTab, SuggestionsTab } from "./tabs";

const TAB_BASE =
  "h-full flex items-center text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/** The bar's tabs, hardcoded: one component per tab. */
const TABS = [
  { key: "campaigns", label: "Campaigns" },
  { key: "alerts", label: "Alerts" },
  { key: "suggestions", label: "Suggestions" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const BADGE_CLASS: Partial<Record<TabKey, string>> = {
  alerts: "bg-destructive text-destructive-foreground",
  suggestions: "bg-brand text-primary-foreground",
};

export function AdManagerDetailBar({
  session,
  isStreaming,
  handleSubmit,
  handleUpdateData,
}: DetailBarComponentProps<AdManagerDetailBarData>) {
  const [activeTab, setActiveTab] = useState<TabKey>("campaigns");

  // Header badges read the same live pages as the tabs.
  const alerts = useBarPager<Alert>(session?.id, "alerts").items;
  const suggestions = useBarPager<Suggestion>(
    session?.id,
    "suggestions",
  ).items;

  const badgeCount: Record<string, number> = {
    alerts: alerts.filter((alert) => alert.status === "pending").length,
    suggestions: suggestions.filter(
      (suggestion) => (suggestion.status ?? "pending") !== "completed",
    ).length,
  };

  const shared = {
    session,
    isStreaming,
    handleSubmit,
    handleUpdateData,
  };

  const activeLabel =
    TABS.find((tab) => tab.key === activeTab)?.label ?? "Campaigns";

  return (
    <div className="relative flex flex-col h-full bg-card select-none">
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
          aria-label="Ad manager"
          className="w-full flex items-center gap-5 h-full overflow-x-auto no-scrollbar scroll-smooth"
        >
          {TABS.map((tab) => {
            const count = badgeCount[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`${TAB_BASE} ${count > 0 ? "gap-1.5" : ""} ${
                  activeTab === tab.key
                    ? "font-bold text-foreground border-brand"
                    : "font-medium text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`w-5 h-5 rounded-none text-[11px] font-bold flex items-center justify-center shrink-0 ${BADGE_CLASS[tab.key] ?? "bg-secondary text-foreground"}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DetailBarHeader>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 pt-3">
        {activeTab === "campaigns" ? (
          <CampaignsTab {...shared} />
        ) : activeTab === "alerts" ? (
          <AlertsTab {...shared} />
        ) : (
          <SuggestionsTab {...shared} />
        )}
      </div>
    </div>
  );
}
