"use client";

import { BarChart3 } from "lucide-react";
import type {
  DetailBarTabProps,
  AdStrategistDetailBarData,
  AdStrategistReport,
} from "../../../../types";
import { DetailBarEmptyState } from "../../../common";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/**
 * One report row. The whole row is a document link into the report route;
 * the route itself renders the stored Generative UI blocks.
 */
function ReportRow({
  report,
  sessionId,
}: {
  report: AdStrategistReport;
  sessionId: string;
}) {
  return (
    <a
      href={`/c/${sessionId}/reports/${encodeURIComponent(report.id)}`}
      className={`relative w-full flex items-start gap-3 rounded-none bg-card border border-border hover:border-input transition-colors p-3 ${FOCUS_RING}`}
    >
      <span className="w-11 shrink-0 flex flex-col items-center justify-center py-1 rounded-none bg-secondary text-foreground">
        <span className="text-[11px] font-semibold leading-none">
          {report.day}
        </span>
        <span className="text-[14px] font-extrabold leading-tight">
          {report.date}
        </span>
      </span>

      <span className="min-w-0 flex-1 flex flex-col gap-0.5">
        <span className="font-bold text-[13px] text-foreground leading-snug flex flex-wrap items-center gap-1.5">
          <span className="break-words">{report.title}</span>
          {report.isNew && (
            <span className="bg-accent text-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded-none leading-none">
              NEW
            </span>
          )}
        </span>
        <span className="text-[12px] text-muted-foreground leading-snug break-words">
          {report.summary}
        </span>
      </span>
    </a>
  );
}

export function ReportsTab({
  session,
  detailBar,
}: DetailBarTabProps<AdStrategistDetailBarData>) {
  const reports = detailBar.data.reports || [];
  const thisWeekReports = reports.filter((r) => r.period === "thisWeek");
  const lastWeekReports = reports.filter((r) => r.period === "lastWeek");

  if (reports.length === 0) {
    return (
      <DetailBarEmptyState
        icon={BarChart3}
        title="No Reports Found"
        description="No strategy or audit reports available yet. Ask the assistant to run an account audit or competitive report."
      />
    );
  }

  return (
    <div className="space-y-4">
      {thisWeekReports.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-muted-foreground tracking-[0.08em] uppercase font-mono">
            THIS WEEK
          </div>
          <div className="space-y-2">
            {thisWeekReports.map((report) => (
              <ReportRow
                key={report.id}
                report={report}
                sessionId={session?.id}
              />
            ))}
          </div>
        </div>
      )}

      {lastWeekReports.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-muted-foreground tracking-[0.08em] uppercase font-mono">
            LAST WEEK
          </div>
          <div className="space-y-2">
            {lastWeekReports.map((report) => (
              <ReportRow
                key={report.id}
                report={report}
                sessionId={session?.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
