"use client";

/**
 * Report page: one report document rendered full-width from the session's
 * `detailBar` projection.
 *
 * The route is `/c/<sessionId>/reports/<reportId>`. Nothing is fetched here:
 * the report record already lives in the folded `detailBar` data, and the
 * shared projection hook seeds it from `session.projection` before folding
 * live `detailBar/update` events. The record's `blocks` field is one
 * normalized json-render spec, drawn with the same renderer the chat blocks
 * and detail-bar charts use.
 *
 * @module @openai-harness/client-ui-report/client/report-page
 */
import { useEffect, useState, type ReactNode } from "react";
import { GenerativeUIRenderer } from "@openai-harness/client-ui-generative/client";
import { useDetailBar } from "@openai-harness/client-ui-session";

/** One report record as written into `detailBar.data.reports`. */
interface ReportRecord {
  id: string;
  period: "thisWeek" | "lastWeek";
  day: string;
  date: string;
  isoDate: string;
  title: string;
  summary: string;
  blocks: Record<string, unknown>;
  isNew?: boolean;
  createdAt: number;
}

/** Browser-history segment pair addressed by the report route. */
export interface ReportPath {
  sessionId: string;
  reportId: string;
}

/** `^/c/<session>/reports/<report>$`, matched after trailing-slash cleanup. */
const REPORT_PATH = /^\/c\/([^/]+)\/reports\/([^/]+)$/;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/** Decode one path segment, keeping the raw text on malformed escapes. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Parse the report route from a pathname.
 *
 * A single trailing slash is ignored, matching the shell's route
 * normalization. Both segments are percent-decoded; malformed escapes fall
 * back to the raw segment instead of throwing.
 *
 * @param pathname - `window.location.pathname` (or any path for tests).
 * @returns the session/report pair, or `null` when the path is not a report.
 */
export function parseReportPath(pathname: string): ReportPath | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = normalized.match(REPORT_PATH);
  if (match === null) return null;
  return {
    sessionId: decodeSegment(match[1]!),
    reportId: decodeSegment(match[2]!),
  };
}

/** Track the report path, re-reading it when history moves. */
function useReportPath(): ReportPath | null {
  const [path, setPath] = useState<ReportPath | null>(() =>
    typeof window === "undefined"
      ? null
      : parseReportPath(window.location.pathname),
  );

  useEffect(() => {
    const onPopState = (): void => {
      setPath(parseReportPath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return path;
}

/** Read the reports array from the opaque projection data. */
function readReports(data: Record<string, unknown>): ReportRecord[] {
  const reports = data.reports;
  return Array.isArray(reports) ? (reports as ReportRecord[]) : [];
}

/** Full-width application background with the centered report column. */
function ReportShell({ children }: { children: ReactNode }) {
  return (
    <main className="h-dvh w-full shrink-0 overflow-x-hidden overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 md:py-10">
        {children}
      </div>
    </main>
  );
}

/** Centered loading state shown until the projection seeds. */
function ReportLoading() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-24 text-[13px] text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground"
      />
      Loading report…
    </div>
  );
}

/** Terminal state for a bad path or a report that is not in the projection. */
function ReportNotFound({ backHref }: { backHref: string }) {
  return (
    <div className="rounded-none border border-border bg-card p-5">
      <h1 className="text-[16px] font-bold leading-tight text-foreground">
        Report not found
      </h1>
      <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
        This report is not available in this session.
      </p>
      <a
        href={backHref}
        className={`mt-4 inline-flex text-[12px] font-semibold text-foreground underline underline-offset-2 ${FOCUS_RING}`}
      >
        Back to conversation
      </a>
    </div>
  );
}

/**
 * Route entry. Parses the path, then delegates to the projection-bound
 * screen so the detail-bar hook is always called unconditionally.
 */
export function ReportPage() {
  const path = useReportPath();

  if (path === null) {
    return (
      <ReportShell>
        <ReportNotFound backHref="/c" />
      </ReportShell>
    );
  }

  return <ReportScreen path={path} />;
}

/**
 * Projection-bound report screen. The record comes from `detailBar.data`,
 * which the session layer seeds from the server snapshot and keeps current by
 * folding the committed event window.
 */
function ReportScreen({ path }: { path: ReportPath }) {
  const detailBar = useDetailBar(path.sessionId);
  const report = readReports(detailBar.data).find(
    (candidate) => candidate.id === path.reportId,
  );
  const backHref = `/c/${encodeURIComponent(path.sessionId)}`;

  useEffect(() => {
    if (report === undefined) return;
    const previous = document.title;
    document.title = report.title;
    return () => {
      document.title = previous;
    };
  }, [report?.title]);

  if (detailBar.loading) {
    return (
      <ReportShell>
        <ReportLoading />
      </ReportShell>
    );
  }

  if (report === undefined) {
    return (
      <ReportShell>
        <ReportNotFound backHref={backHref} />
      </ReportShell>
    );
  }

  return (
    <ReportShell>
      <article className="w-full">
        <a
          href={backHref}
          className={`inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground ${FOCUS_RING}`}
        >
          <span aria-hidden="true">←</span>
          Back to conversation
        </a>

        <header className="mt-6 flex items-start gap-3 border-b border-border pb-5">
          <span className="flex w-11 shrink-0 flex-col items-center justify-center rounded-none bg-foreground py-1 text-background">
            <span className="text-[11px] font-semibold leading-none">
              {report.day}
            </span>
            <span className="text-[14px] font-extrabold leading-tight">
              {report.date}
            </span>
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-[20px] font-bold leading-tight text-foreground">
              <span className="break-words">{report.title}</span>
              {report.isNew && (
                <span className="rounded-none bg-accent px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-foreground">
                  NEW
                </span>
              )}
            </h1>
            <p className="mt-1.5 break-words text-[13px] leading-snug text-muted-foreground">
              {report.summary}
            </p>
          </div>
        </header>

        <div className="mt-6">
          <GenerativeUIRenderer
            spec={report.blocks}
            scopeId={`report-${report.id}`}
          />
        </div>
      </article>
    </ReportShell>
  );
}
