"use client";

import { Lightbulb } from "lucide-react";
import type { DetailBarTabProps, DefaultDetailBarData } from "../../../../types";
import { DetailBarEmptyState } from "../../../common";

export function OverviewTab({
  detailBar,
}: DetailBarTabProps<DefaultDetailBarData>) {
  const data = detailBar.data;

  return (
    <div className="space-y-4">
      {data?.notes ? (
        <div className="border border-border rounded-none p-3.5 bg-muted">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 font-mono">
            Notes
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{data.notes}</p>
        </div>
      ) : (
        <DetailBarEmptyState
          icon={Lightbulb}
          title="No Insights Available"
          description="No workspace insights or notes recorded for this session yet."
        />
      )}
    </div>
  );
}
