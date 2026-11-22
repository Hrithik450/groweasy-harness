import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionByUserIdAndSessionId } from "@/lib/services";
import { getSessionFromCookies } from "@/lib/auth";
import { readBarItemForSessionField } from "@/lib/detail.bar/service";
import { GenerativeUIRenderer } from "@/components/generative.ui/renderer";
import type { CompetitorResearchItem } from "@/lib/detail.bar/types";
import { reportDateLabels } from "@/lib/utils/report.date";

export const instant = false;

interface PageProps {
  params: Promise<{ sessionId: string; researchId: string }>;
}

function researchDateLabel(createdAt: string | undefined): string {
  const date = reportDateLabels(createdAt).date;
  return date ? `Competitor research · ${date}` : "Competitor research";
}

/**
 * One saved competitor research finding, rendered from the UI-block spec
 * stored with it.
 *
 * Research is a page, not a bubble: the link is shareable and survives the
 * chat scrolling away.
 */
export default async function ResearchPage({ params }: PageProps) {
  await connection();
  const { sessionId, researchId } = await params;

  const user = await getSessionFromCookies();
  if (!user) redirect("/");

  const sessionRes = await getSessionByUserIdAndSessionId(user.id, sessionId);
  const session = sessionRes?.data;
  if (!session || session.id !== sessionId) redirect("/c");

  const item = readBarItemForSessionField(
    session.id,
    "competitorResearches",
    researchId,
  );
  if (!item) redirect(`/c/${session.id}`);

  const research = item as unknown as CompetitorResearchItem;
  const spec = research.blocks as
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
            {researchDateLabel(research.createdAt)}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {research.title}
          </h1>
          {research.content ? (
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {research.content}
            </p>
          ) : null}
        </header>

        {spec?.root && spec?.elements ? (
          <GenerativeUIRenderer
            scopeId={`research-${research.id}`}
            spec={research.blocks}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            This research was saved before full page content was stored, so{" "}
            {research.content
              ? "only the summary is available."
              : "only its title is available."}
          </p>
        )}
      </div>
    </main>
  );
}
