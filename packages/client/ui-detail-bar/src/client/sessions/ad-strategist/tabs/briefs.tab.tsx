"use client";

import { FileText, MessageSquare, ArrowUpRight } from "lucide-react";
import type {
  AdStrategistDetailBarData,
  AdStrategistDocument,
  DetailBarTabProps,
} from "../../../../types";
import { useDetailBar, useSessionStore } from "@openai-harness/client-ui-session";
import { DetailBarEmptyState } from "../../../common";
import { campaignBriefDocuments } from "../documents";

/**
 * The campaign-brief tab.
 *
 * Briefs are brand-level documents held on the canonical Ad Strategist
 * session, not on whichever chat is open: a brief drafted in any chat (and
 * persisted by `saveCampaignBrief`) shows here, survives switching chats and
 * reloading, and updates live through the same session event stream as
 * competitor research. Only when that session does not exist yet does it fall
 * back to the current bar.
 */
export function BriefsTab(props: DetailBarTabProps<AdStrategistDetailBarData>) {
  const canonicalId = useSessionStore(
    (state) =>
      state.sessions.find((session) => session.slug === "adStrategist")?.id,
  );

  if (canonicalId === undefined) {
    return <BriefsList {...props} />;
  }
  return <CanonicalBriefsList canonicalId={canonicalId} {...props} />;
}

/** Read the canonical Ad Strategist bar and render its documents here. */
function CanonicalBriefsList({
  canonicalId,
  detailBar,
  ...rest
}: DetailBarTabProps<AdStrategistDetailBarData> & { canonicalId: string }) {
  const canonical = useDetailBar(canonicalId);
  const canonicalData = canonical.data as unknown as AdStrategistDetailBarData;

  return (
    <BriefsList
      {...rest}
      detailBar={{
        type: detailBar.type,
        data: {
          ...detailBar.data,
          documents: canonicalData.documents,
        },
      }}
    />
  );
}

function BriefsList({
  detailBar,
  handleNavigation,
}: DetailBarTabProps<AdStrategistDetailBarData>) {
  const documents = campaignBriefDocuments(detailBar.data.documents ?? []);

  if (documents.length === 0) {
    return (
      <DetailBarEmptyState
        icon={FileText}
        title="No Campaign Briefs Yet"
        description="Ask the assistant to draft a campaign brief for your brand. Briefs it saves appear here and stay after a reload."
      />
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {documents.map((document) => (
        <div
          key={document.id}
          onClick={() => {
            if (document.messageId) {
              handleNavigation?.(document.messageId);
            }
          }}
          className="group relative rounded-none p-4 border border-border bg-card hover:border-input transition-colors cursor-pointer"
        >
          {/* Top Row: Title + Date */}
          <div className="flex items-start justify-between gap-2.5 mb-2">
            <h4 className="font-bold text-[14px] text-foreground tracking-tight leading-snug truncate group-hover:text-brand transition-colors min-w-0">
              {document.title}
            </h4>
            <span className="text-[11px] font-medium text-muted-foreground shrink-0 font-mono pt-0.5">
              {formatDateLabel(document)}
            </span>
          </div>

          {/* Content Preview */}
          {document.content ? (
            <p className="text-[12.5px] text-muted-foreground line-clamp-2 leading-relaxed mb-3">
              {document.content}
            </p>
          ) : null}

          {/* Footer: Jump to chat */}
          <div className="flex items-center justify-between pt-2.5 border-t border-border">
            <span className="text-[11px] font-medium text-muted-foreground">
              {document.kind}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (document.messageId) {
                  handleNavigation?.(document.messageId);
                }
              }}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover:text-brand transition-colors shrink-0 cursor-pointer active:scale-95"
            >
              <MessageSquare className="w-3 h-3 text-muted-foreground group-hover:text-brand" />
              <span>Jump to chat</span>
              <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Real date for a saved brief; the stored label otherwise. */
function formatDateLabel(document: AdStrategistDocument): string {
  if (!document.createdAt) return document.dateLabel;
  const parsed = new Date(document.createdAt);
  if (Number.isNaN(parsed.getTime())) return document.dateLabel;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
