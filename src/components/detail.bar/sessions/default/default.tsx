"use client";

import { DetailBarHeader } from "../../common";
import { OverviewTab } from "./tabs";
import type { DefaultSessionTabProps } from "./types";

/** Detail bar for a session that uses no specialised preset. */
export function DefaultDetailBar({ session, data }: DefaultSessionTabProps) {
  return (
    <div className="flex h-full flex-col">
      <DetailBarHeader title={session?.title} subtitle="Session" />
      <div className="flex-1 overflow-y-auto">
        <OverviewTab session={session} data={data} />
      </div>
    </div>
  );
}
