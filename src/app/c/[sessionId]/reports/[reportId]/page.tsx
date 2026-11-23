import { connection } from "next/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClientRedirect } from "@/components/client.redirect";
import { getSessionByUserIdAndSessionId } from "@/lib/services";
import { getSessionFromCookies } from "@/lib/auth";
import { readBarItemForSession } from "@/lib/detail.bar/service";
import { GenerativeUIRenderer } from "@/components/generative.ui/renderer";
import type { DailyReport } from "@/lib/detail.bar/types";
import { reportDateLabels } from "@/lib/utils/report.date";

interface PageProps {
  params: Promise<{ sessionId: string; reportId: string }>;
}

/**
 * One saved daily report, rendered from the UI-block spec stored with it.
 *
 * A report is a page, not a bubble: the link is shareable and survives the
 * chat scrolling away.
 */
export default async function ReportPage({ params }: PageProps) {
  await connection();
  const { sessionId, reportId } = await params;

  const user = await getSessionFromCookies();
  if (!user) return <ClientRedirect href="/" />;

  const sessionRes = await getSessionByUserIdAndSessionId(
    user.id,
    sessionId,
  );
  const session = sessionRes?.data;
  if (!session || session.id !== sessionId) {
    return <ClientRedirect href="/c" />;
  }

  const item = readBarItemForSession(session.id, reportId);
  if (!item) return <ClientRedirect href={`/c/${session.id}`} />;

  const report = item as unknown as DailyReport;
  const spec = report.blocks as
    | { root?: unknown; elements?: unknown }
    | undefined;

  return (
    <main className="h-full w-full overflow-y-auto bg-background text-foreground panel-slide-in-right">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href={`/c/${session.id}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to chat
        </Link>

        <header className="mt-5 mb-6 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-mono">
            {reportDateLabels(report.createdAt).date}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {report.title}
          </h1>
          {report.summary ? (
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {report.summary}
            </p>
          ) : null}
        </header>

        {spec?.root && spec?.elements ? (
          <GenerativeUIRenderer
            scopeId={`report-${report.id}`}
            spec={report.blocks}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            This report has no rendered content.
          </p>
        )}
      </div>
    </main>
  );
}
