"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Pause,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { buildSuggestionPrompt } from "@/lib/prompts/suggestion";
import type {
  Suggestion,
  AdManagerDetailBarData,
  DetailBarTabProps,
} from "@/lib/detail.bar/types";
import { formatAlertTimestamp } from "@/lib/utils/date";
import { useBarPager } from "@/hooks/use.bar.pager";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
} from "@/components/detail.bar/common";

type SuggestionMode = "dismiss" | "primary";
type SuggestionIconName = "stop" | "shift" | "refresh" | "pause";

/** Recovery shape: suggestion rows add presentation fields onto the merged alert type. */
type SuggestionView = Suggestion & {
  savings?: string;
  icon?: SuggestionIconName;
  prompt?: string;
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-foreground/80 hover:text-foreground bg-card hover:bg-muted border border-border hover:border-border-strong rounded-xl text-xs font-medium cursor-pointer transition-all shadow-2xs active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center px-4 py-1.5 bg-brand hover:bg-brand-hover text-primary-foreground rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-xs active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed border border-brand-border/30";

function resolveIcon(suggestion: SuggestionView): SuggestionIconName {
  // A suggestion is a move to make, so the growth icon is the honest default.
  return suggestion.icon ?? "shift";
}

function SuggestionIcon({ icon }: { icon: SuggestionIconName }) {
  const className = "w-3.5 h-3.5";
  switch (icon) {
    case "shift":
      return <TrendingUp className={className} aria-hidden="true" />;
    case "refresh":
      return <ImageIcon className={className} aria-hidden="true" />;
    case "stop":
    case "pause":
    default:
      return <Pause className={className} aria-hidden="true" />;
  }
}

function iconTileClass(icon: SuggestionIconName): string {
  if (icon === "stop" || icon === "pause") {
    return "bg-destructive-tint text-destructive";
  }
  return "bg-secondary text-foreground";
}

export function SuggestionsTab({
  session,
  data,
  isStreaming,
  handleSubmit,
  handleUpdateData,
}: DetailBarTabProps<AdManagerDetailBarData>) {
  const [busy, setBusy] = useState<{
    id: string;
    mode: SuggestionMode;
  } | null>(null);

  const seed: SuggestionView[] = data.suggestions ?? [];
  const pager = useBarPager(session?.id ?? "", "suggestions", seed);

  // Seed rows and fetched pages can overlap after a dismiss update.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    return pager.items.filter((suggestion) => {
      if (seen.has(suggestion.id)) return false;
      seen.add(suggestion.id);
      return true;
    });
  }, [pager.items]);

  const activeCount = suggestions.filter(
    (suggestion) => (suggestion.status ?? "pending") !== "completed",
  ).length;

  const handleDismiss = async (suggestion: SuggestionView) => {
    if (busy) return;
    setBusy({ id: suggestion.id, mode: "dismiss" });
    const updated = suggestions.map((item) =>
      item.id === suggestion.id
        ? { ...item, status: "completed" as const }
        : item,
    );

    try {
      await handleUpdateData?.({ suggestions: updated }, {
        kind: "suggestions",
        id: suggestion.id,
        patch: { status: "completed" },
      });
      toast.success("Suggestion dismissed");
    } catch (err) {
      console.error("Failed to dismiss suggestion:", err);
      toast.error("Failed to dismiss suggestion");
    } finally {
      setBusy(null);
    }
  };

  const handlePrimary = async (suggestion: SuggestionView) => {
    if (busy || isStreaming) return;
    setBusy({ id: suggestion.id, mode: "primary" });
    try {
      await handleSubmit?.(buildSuggestionPrompt(suggestion), {
        source: "detail-bar",
      });
      toast.success("Sent to the assistant");
    } catch (err) {
      console.error("Failed to run suggestion:", err);
      toast.error("Failed to run suggestion");
    } finally {
      setBusy(null);
    }
  };

  if (suggestions.length === 0) {
    return (
      <DetailBarEmptyState
        icon={Lightbulb}
        title="No Suggestions Yet"
        description="Ask the assistant to scan for opportunities."
      />
    );
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="text-[13px] text-muted-foreground">
        {activeCount} suggestions from today&apos;s check
      </div>

      <div className="space-y-2.5">
        {suggestions.map((suggestion) => {
          const isCompleted = (suggestion.status ?? "pending") === "completed";
          const isDismissing =
            busy?.id === suggestion.id && busy.mode === "dismiss";
          const isRunning =
            busy?.id === suggestion.id && busy.mode === "primary";
          const isBusy = Boolean(busy) || Boolean(isStreaming);
          const icon = resolveIcon(suggestion);

          return (
            <article
              key={suggestion.id}
              className="border border-border bg-card rounded-2xl p-4 space-y-3 transition-all shadow-2xs hover:shadow-xs hover:border-border-strong"
            >
              {/* Header: icon, title, state badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-start gap-2.5">
                  <span
                    className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-lg ${iconTileClass(
                      icon,
                    )}`}
                  >
                    <SuggestionIcon icon={icon} />
                  </span>
                  <h4 className="min-w-0 flex-1 font-semibold text-[13.5px] text-foreground tracking-tight leading-snug break-words line-clamp-1">
                    {suggestion.title}
                  </h4>
                </div>

                {isCompleted && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-none bg-success-tint text-brand border border-success-border">
                    <CheckCircle2 className="w-3 h-3 text-brand" />
                    Completed
                  </span>
                )}
              </div>

              <p className="text-[12.5px] text-muted-foreground leading-relaxed font-normal break-words line-clamp-2">
                {suggestion.description}
              </p>

              {suggestion.savings && (
                <p className="text-[12px] font-bold text-success leading-snug break-words line-clamp-1">
                  {suggestion.savings}
                </p>
              )}

              {suggestion.action?.fix && (
                <div className="bg-muted border border-border-subtle rounded-xl p-3 text-[12.5px]">
                  <p className="text-foreground leading-relaxed font-medium line-clamp-1">
                    {suggestion.action.fix}
                  </p>
                </div>
              )}

              {/* Footer: date left, actions right — same row as alerts */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] border-t border-border-subtle">
                <span className="shrink-0 text-[11px] text-muted-2 font-medium">
                  {formatAlertTimestamp(suggestion.createdAt)}
                </span>

                {isCompleted ? (
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase text-brand bg-success-tint px-2.5 py-1 rounded-xl border border-success-border">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                    Completed
                  </span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDismiss(suggestion)}
                      disabled={isBusy && !isDismissing}
                      className={`${SECONDARY_BUTTON} ${FOCUS_RING}`}
                    >
                      {isDismissing ? (
                        <Loader2
                          className="w-3.5 h-3.5 animate-spin text-muted-foreground"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span>{isDismissing ? "Dismissing..." : "Dismiss"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePrimary(suggestion)}
                      disabled={isBusy && !isRunning}
                      className={`${PRIMARY_BUTTON} ${FOCUS_RING}`}
                    >
                      {isRunning ? (
                        <Loader2
                          className="w-3.5 h-3.5 animate-spin text-primary-foreground"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span>{isRunning ? "Working..." : "Do with AI"}</span>
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}
