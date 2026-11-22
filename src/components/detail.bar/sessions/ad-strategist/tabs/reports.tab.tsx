"use client";

import { BarChart3 } from "lucide-react";
import { useBarPager } from "@/hooks/use.bar.pager";
import { groupByDay } from "@/lib/utils/day.group";
import { isReportToday, reportDateLabels } from "@/lib/utils/report.date";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
  DetailBarViewLink,
} from "@/components/detail.bar/common";
import type {
  AdStrategistDetailBarData,
  DailyReport,
  DetailBarTabProps,
} from "@/lib/detail.bar/types";

/** One report row: the date tile, the gist, and the page it opens. */
function ReportRow({
  report,
  sessionId,
}: {
  report: DailyReport;
  sessionId: string;
}) {
  const { month, dayNumber } = reportDateLabels(report.createdAt);

  return (
    <article className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-2xs transition-all hover:border-brand/40 hover:shadow-sm">
      <span className="w-12 shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border border-border-subtle bg-secondary py-2 text-foreground">
        <span className="text-[15px] font-extrabold leading-none tabular-nums">
          {dayNumber}
        </span>
        <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground leading-none">
          {month}
        </span>
      </span>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1.5">
          <h4 className="min-w-0 text-[13.5px] font-bold tracking-tight text-foreground leading-snug break-words line-clamp-1">
            {report.title}
          </h4>
          {isReportToday(report.createdAt) && (
            <span className="shrink-0 bg-accent text-foreground text-[9.5px] font-extrabold uppercase p-1.5 rounded-md leading-none">
              New
            </span>
          )}
        </div>

        <p className="text-[12px] text-muted-foreground leading-snug break-words line-clamp-2">
          {report.summary}
        </p>

        <DetailBarViewLink
          href={`/c/${sessionId}/reports/${encodeURIComponent(report.id)}`}
        />
      </div>
    </article>
  );
}

export function ReportsTab({
  session,
}: DetailBarTabProps<AdStrategistDetailBarData>) {
  const pager = useBarPager<DailyReport>(session?.id, "reports");
  const groups = groupByDay(pager.items, (report) => report.createdAt);
  const sessionId = session?.id ?? "";

  if (pager.items.length === 0) {
    return (
      <DetailBarEmptyState
        icon={BarChart3}
        title="No Reports Yet"
        description="Daily reports appear here once the Ad Strategist saves one."
      />
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider font-mono text-muted-foreground">
              {group.label}
            </span>
            <span className="flex-1 h-px bg-border" />
            <span className="shrink-0 text-[10.5px] font-mono text-muted-2">
              {group.items.length}{" "}
              {group.items.length === 1 ? "Report" : "Reports"}
            </span>
          </div>

          <div className="space-y-2">
            {group.items.map((report) => (
              <ReportRow key={report.id} report={report} sessionId={sessionId} />
            ))}
          </div>
        </section>
      ))}

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}
