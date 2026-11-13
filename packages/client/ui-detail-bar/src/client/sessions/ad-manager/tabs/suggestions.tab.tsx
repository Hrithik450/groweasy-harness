"use client";

import { useState } from "react";
import {
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Pause,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AdManagerDetailBarData,
  AdManagerSuggestion,
  AdManagerSuggestionIcon,
  DetailBarTabProps,
} from "../../../../types";
import { DetailBarEmptyState } from "../../../common";

type SuggestionMode = "dismiss" | "primary";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function SuggestionIcon({
  icon,
}: {
  icon?: AdManagerSuggestionIcon;
}) {
  const className = "w-4 h-4";
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

function iconTileClass(icon?: AdManagerSuggestionIcon): string {
  if (icon === "stop" || icon === "pause") {
    return "bg-destructive-tint text-destructive";
  }
  return "bg-secondary text-foreground";
}

export function SuggestionsTab({
  detailBar,
  isStreaming,
  handleSubmit,
  handleUpdateData,
}: DetailBarTabProps<AdManagerDetailBarData>) {
  const [busy, setBusy] = useState<{
    id: string;
    mode: SuggestionMode;
  } | null>(null);

  const suggestions: AdManagerSuggestion[] =
    detailBar.data.suggestions ?? [];

  const activeCount = suggestions.filter(
    (suggestion) => (suggestion.status ?? "pending") !== "completed",
  ).length;

  const handleDismiss = async (suggestion: AdManagerSuggestion) => {
    if (busy) return;
    setBusy({ id: suggestion.id, mode: "dismiss" });
    const updated = suggestions.map((item) =>
      item.id === suggestion.id
        ? { ...item, status: "completed" as const }
        : item,
    );

    try {
      await handleUpdateData?.({ suggestions: updated });
      toast.success("Suggestion dismissed");
    } catch (err) {
      console.error("Failed to dismiss suggestion:", err);
      toast.error("Failed to dismiss suggestion");
    } finally {
      setBusy(null);
    }
  };

  const handlePrimary = async (suggestion: AdManagerSuggestion) => {
    if (busy || isStreaming) return;
    setBusy({ id: suggestion.id, mode: "primary" });
    try {
      await handleSubmit?.(suggestion.prompt, { isHidden: true });
      toast.success(`Dispatched "${suggestion.actionLabel}"`);
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
    <div className="space-y-3">
      <div className="text-[13px] text-muted-foreground">
        {activeCount} suggestions from today&apos;s check
      </div>

      <div className="space-y-2.5">
        {suggestions.map((suggestion) => {
          const isCompleted =
            (suggestion.status ?? "pending") === "completed";
          const isDismissing =
            busy?.id === suggestion.id && busy.mode === "dismiss";
          const isRunning =
            busy?.id === suggestion.id && busy.mode === "primary";
          const isBusy = Boolean(busy) || Boolean(isStreaming);

          return (
            <article
              key={suggestion.id}
              className="border border-border bg-card rounded-none p-3.5 space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-none ${iconTileClass(
                    suggestion.icon,
                  )}`}
                >
                  <SuggestionIcon icon={suggestion.icon} />
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <h4 className="font-bold text-[13px] text-foreground leading-snug break-words">
                    {suggestion.title}
                  </h4>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed break-words">
                    {suggestion.description}
                  </p>
                  {suggestion.savings && (
                    <p className="text-[12px] font-bold text-success leading-snug break-words">
                      {suggestion.savings}
                    </p>
                  )}
                </div>
              </div>

              {isCompleted ? (
                <div className="flex items-center justify-end">
                  <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-none bg-success-tint text-success border border-success-border">
                    Completed
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleDismiss(suggestion)}
                    disabled={isBusy && !isDismissing}
                    className={`min-h-9 px-3 py-1.5 border border-input bg-card text-foreground hover:bg-muted rounded-none text-[12px] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
                  >
                    {isDismissing ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2
                          className="w-3.5 h-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        <span>Dismissing...</span>
                      </span>
                    ) : (
                      <span>Dismiss</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrimary(suggestion)}
                    disabled={isBusy && !isRunning}
                    className={`min-h-9 px-3.5 py-1.5 bg-brand hover:bg-brand-hover text-primary-foreground rounded-none text-[12px] font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
                  >
                    {isRunning ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2
                          className="w-3.5 h-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        <span>Working...</span>
                      </span>
                    ) : (
                      <span>{suggestion.actionLabel}</span>
                    )}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
