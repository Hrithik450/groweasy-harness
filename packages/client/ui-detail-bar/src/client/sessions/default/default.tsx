"use client";

import type {
  DetailBarComponentProps,
  DefaultDetailBarData,
} from "../../../types";
import { DetailBarHeader } from "../../common";
import { OverviewTab } from "./tabs";

export function DefaultDetailBar({
  session,
  detailBar,
  isStreaming,
  handleSubmit,
  handleUpdateData,
  handleNavigation,
}: DetailBarComponentProps<DefaultDetailBarData>) {
  return (
    <div className="flex flex-col h-full bg-card select-none">
      <DetailBarHeader
        title={session?.title}
        subtitle="Ready"
      />

      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        <OverviewTab
          session={session}
          detailBar={detailBar}
          isStreaming={isStreaming}
          handleSubmit={handleSubmit}
          handleUpdateData={handleUpdateData}
          handleNavigation={handleNavigation}
        />
      </div>
    </div>
  );
}
