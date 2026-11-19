"use client";

import { useState, type ReactNode } from "react";
import type {
  DetailBarComponentProps,
  AdManagerDetailBarData,
} from "@/lib/detail.bar/types";
import { barTabs, childTabs, type TabRef } from "@/lib/detail.bar/fields";
import { DetailBarHeader } from "../../common";
import {
  AlertsTab,
  CampaignsAdsTab,
  CampaignsTab,
  SuggestionsTab,
} from "./tabs";

const TAB_BASE =
  "h-full flex items-center text-[14px] transition-all cursor-pointer border-b-[2.5px] -mb-[1px] shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/** One row we have opened; `kind` is that row's tab path. */
interface Level {
  kind: string;
  id: string;
}

/** Props every level view receives. */
type LevelViewProps = DetailBarComponentProps<AdManagerDetailBarData> & {
  /** The row this level sits inside, when it is nested. */
  parentId?: string;
  /** Opens one of this level's rows at its own tab path. */
  onOpen: (kind: string, id: string) => void;
  onBack: () => void;
};

/**
 * One view per tab path; the config decides which paths exist.
 *
 * Adding a tab = config entry + one entry here. Opening a row pushes its kind
 * onto the stack, so a deeper level needs no change to this shell.
 */
const VIEWS: Record<string, (props: LevelViewProps) => ReactNode> = {
  campaigns: ({ detailBar, session, onOpen }) => (
    <CampaignsTab data={detailBar.data} session={session} onOpen={onOpen} />
  ),
  "campaigns.ads": ({
    parentId,
    detailBar,
    session,
    isStreaming,
    handleSubmit,
    handleUpdateData,
    onBack,
  }) =>
    parentId ? (
      <CampaignsAdsTab
        campaignId={parentId}
        data={detailBar.data}
        session={session}
        isStreaming={isStreaming}
        handleSubmit={handleSubmit}
        handleUpdateData={handleUpdateData}
        onBack={onBack}
      />
    ) : null,
  alerts: ({
    detailBar,
    session,
    isStreaming,
    handleSubmit,
    handleUpdateData,
    handleNavigation,
  }) => (
    <AlertsTab
      data={detailBar.data}
      session={session}
      isStreaming={isStreaming}
      handleSubmit={handleSubmit}
      handleUpdateData={handleUpdateData}
      handleNavigation={handleNavigation}
    />
  ),
  suggestions: ({
    detailBar,
    session,
    isStreaming,
    handleSubmit,
    handleUpdateData,
    handleNavigation,
  }) => (
    <SuggestionsTab
      data={detailBar.data}
      session={session}
      isStreaming={isStreaming}
      handleSubmit={handleSubmit}
      handleUpdateData={handleUpdateData}
      handleNavigation={handleNavigation}
    />
  ),
};

const BADGE_CLASS: Partial<Record<string, string>> = {
  alerts: "bg-destructive text-destructive-foreground",
  suggestions: "bg-brand text-primary-foreground",
};

export function AdManagerDetailBar(
  props: DetailBarComponentProps<AdManagerDetailBarData>,
) {
  const { detailBar } = props;
  const rootTabs = barTabs("adManager");

  const [activeRoot, setActiveRoot] = useState<string>(
    rootTabs[0]?.key ?? "",
  );
  const [path, setPath] = useState<Level[]>([]);
  const [levelTab, setLevelTab] = useState<string | null>(null);

  const parent = path.at(-1);
  const tabs: TabRef[] = parent ? childTabs(parent.kind) : rootTabs;
  const activeKey = parent
    ? (tabs.find((tab) => tab.key === levelTab)?.key ?? tabs[0]?.key ?? "")
    : activeRoot;

  const barData = detailBar.data;
  const badgeCount: Record<string, number> = {
    alerts: (barData.alerts ?? []).filter((alert) => alert.status === "pending")
      .length,
    suggestions: (barData.suggestions ?? []).filter(
      (suggestion) => (suggestion.status ?? "pending") !== "completed",
    ).length,
  };

  const open = (kind: string, id: string) => {
    setPath((current) => [...current, { kind, id }]);
    setLevelTab(null);
  };

  const back = () => {
    setPath((current) => current.slice(0, -1));
    setLevelTab(null);
  };

  const view = VIEWS[activeKey];

  return (
    <div className="relative flex flex-col h-full bg-card select-none">
      <DetailBarHeader>
        <div
          role="tablist"
          aria-label="Ad manager"
          className="w-full flex items-center gap-5 h-full overflow-x-auto no-scrollbar scroll-smooth"
        >
          {tabs.map((tab) => {
            const count = parent ? 0 : (badgeCount[tab.key] ?? 0);
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={tab.key === activeKey}
                onClick={() => {
                  if (parent) {
                    setLevelTab(tab.key);
                    return;
                  }
                  setActiveRoot(tab.key);
                  setPath([]);
                  setLevelTab(null);
                }}
                className={`${TAB_BASE} ${count > 0 ? "gap-1.5" : ""} ${
                  tab.key === activeKey
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
        {view
          ? view({
              ...props,
              parentId: parent?.id,
              onOpen: open,
              onBack: back,
            })
          : null}
      </div>
    </div>
  );
}
