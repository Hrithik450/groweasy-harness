"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Check,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { refreshSessionDetailBar } from "../../../session";
import { buildAlertFixPrompt } from "../../../../utils";
import { formatAlertTimestamp } from "../../../../date";
import { DetailBarGenerativeUI as GenerativeUIRenderer } from "../../../generative-ui";
import type {
  AdManagerAlert,
  DetailBarTabProps,
  AdManagerDetailBarData,
} from "../../../../types";
import { DetailBarEmptyState } from "../../../common";

type FilterType = "all" | "pending" | "completed";

const FILTER_OPTIONS: { id: FilterType; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "pending", label: "NEEDS ACTION" },
  { id: "completed", label: "RESOLVED" },
];

export function AlertsTab({
  session,
  detailBar,
  isStreaming,
  handleSubmit,
  handleUpdateData,
}: DetailBarTabProps<AdManagerDetailBarData>) {
  const activeAlerts: AdManagerAlert[] =
    detailBar.data.alerts ?? [];

  const [filter, setFilter] = useState<FilterType>("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [resolvingAiId, setResolvingAiId] = useState<string | null>(null);
  const [resolvingManualId, setResolvingManualId] = useState<string | null>(
    null,
  );
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<
    Record<string, boolean>
  >({});

  const togglePreview = (id: string) => {
    setExpandedPreviewIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredAlerts = activeAlerts.filter((a) => {
    if (filter === "pending") return a.status !== "completed";
    if (filter === "completed") return a.status === "completed";
    return true;
  });

  const currentFilterLabel =
    FILTER_OPTIONS.find((f) => f.id === filter)?.label || "ALL";

  const handleRefresh = async () => {
    if (isRefreshing || !session?.id) return;
    setIsRefreshing(true);
    try {
      await refreshSessionDetailBar(session.id);
      toast.success("Alerts refreshed");
    } catch (err) {
      console.error("Failed to refresh alerts:", err);
      toast.error("Failed to refresh alerts");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAction = async (
    alert: AdManagerAlert,
    mode: "ai" | "manual",
  ) => {
    if (mode === "ai") {
      if (isStreaming || resolvingAiId) return;
      setResolvingAiId(alert.id);
      try {
        const hiddenMessage = buildAlertFixPrompt(alert);
        await handleSubmit?.(hiddenMessage, { isHidden: true });
        toast.success(`Dispatched AI action for "${alert.title}"`);
      } catch (err) {
        console.error("Failed to trigger remediation:", err);
        toast.error("Failed to trigger remediation.");
      } finally {
        setResolvingAiId(null);
      }
      return;
    }

    if (mode === "manual") {
      if (resolvingManualId === alert.id || resolvingAiId === alert.id) return;
      setResolvingManualId(alert.id);
      try {
        const updated = activeAlerts.map((a) =>
          a.id === alert.id
            ? {
                ...a,
                status: "completed" as const,
              }
            : a,
        );
        await handleUpdateData?.({
          alerts: updated,
        });
        toast.success("Marked as completed");
      } catch (err) {
        console.error("Failed to mark as completed:", err);
        toast.error("Failed to mark as completed.");
      } finally {
        setResolvingManualId(null);
      }
    }
  };

  return (
    <div className="space-y-1.5">
      {/* Action Row: Refresh & Filter Dropdown */}
      <div className="flex items-center justify-end gap-1.5 pb-0.5">
        {session?.id && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1 text-muted-foreground hover:text-foreground bg-card hover:bg-muted rounded-none border border-border transition-colors cursor-pointer disabled:opacity-60"
            title="Refresh alerts"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isRefreshing ? "animate-spin text-brand" : ""
              }`}
            />
          </button>
        )}

        {/* Status Filter Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="px-2.5 py-1 border border-border rounded-none text-[12px] font-medium text-foreground bg-card hover:bg-muted transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>{currentFilterLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {showFilterMenu && (
            <div className="absolute right-0 mt-1 w-36 bg-card border border-border rounded-none py-1 z-30">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setFilter(opt.id);
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between cursor-pointer ${
                    filter === opt.id
                      ? "bg-muted text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span>{opt.label}</span>
                  {filter === opt.id && (
                    <CheckCircle2 className="w-3 h-3 text-brand" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerts Cards List */}
      {filteredAlerts.length === 0 ? (
        <DetailBarEmptyState
          icon={AlertCircle}
          title="No Matching Alerts"
          description="No alerts match the selected status filter."
        />
      ) : (
        <div className="space-y-2.5">
          {filteredAlerts.map((alert) => {
            const status = alert.status ?? "pending";
            const isCritical = alert.severity === "critical";
            const isGood = alert.severity === "good";
            const isCompleted = status === "completed";
            const isError = status === "error";
            const isAiDisabled = Boolean(isStreaming || resolvingAiId);
            const isManualDisabled =
              resolvingManualId === alert.id || resolvingAiId === alert.id;
            const actionFix =
              typeof alert.action === "object" && alert.action !== null
                ? alert.action.fix
                : String(alert.action || "");
            const actionBefore =
              typeof alert.action === "object" && alert.action?.before
                ? alert.action.before
                : actionFix
                  ? `Current performance baseline for "${alert.title}"`
                  : undefined;
            const actionAfter =
              typeof alert.action === "object" && alert.action?.after
                ? alert.action.after
                : actionFix
                  ? `Execute remediation plan for "${alert.title}" and stage drafts`
                  : undefined;

            const isPreviewExpanded = Boolean(expandedPreviewIds[alert.id]);

            return (
              <div
                key={alert.id}
                className="border border-border bg-card rounded-none p-4 space-y-3 transition-colors hover:border-input"
              >
                {/* Header: Title & Severity Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-[13.5px] text-foreground tracking-tight leading-snug">
                      {alert.title}
                    </h4>
                  </div>

                  {/* Status / Severity Badge */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-none bg-success-tint text-brand border border-success-border">
                        <CheckCircle2 className="w-3 h-3 text-brand" />
                        Resolved
                      </span>
                    ) : isError ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-none bg-destructive-tint text-destructive border border-destructive/25">
                        <XCircle className="w-3 h-3 text-destructive" />
                        Failed
                      </span>
                    ) : isCritical ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-none bg-destructive-tint text-destructive border border-destructive/25">
                        <AlertCircle className="w-3 h-3 text-destructive" />
                        Critical
                      </span>
                    ) : isGood ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-none bg-success-tint text-brand border border-success-border">
                        <TrendingUp className="w-3 h-3 text-brand" />
                        Good
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-none bg-warning-tint text-warning border border-warning/30">
                        <AlertTriangle className="w-3 h-3 text-warning" />
                        Warning
                      </span>
                    )}
                  </div>
                </div>

                {/* Description - Clamped to 2 lines */}
                <p className="text-[12.5px] text-muted-foreground leading-relaxed font-normal line-clamp-2">
                  {alert.description}
                </p>

                {/* Diagnostic Trend Chart (rendered before recommended action) */}
                {alert.chart &&
                  typeof alert.chart === "object" &&
                  "root" in alert.chart && (
                    <div className="bg-card border border-border rounded-none p-2.5 overflow-hidden">
                      <GenerativeUIRenderer
                        spec={alert.chart as Record<string, unknown>}
                        scopeId={`alert-chart-${alert.id}`}
                      />
                    </div>
                  )}

                {/* Recommended Action */}
                {actionFix && (
                  <div className="bg-muted border border-success-tint rounded-none p-3 text-[12.5px]">
                    <p className="text-foreground leading-relaxed font-medium">
                      {actionFix}
                    </p>
                  </div>
                )}

                {/* Collapsible Changes Preview Drawer */}
                {(actionBefore || actionAfter) && (
                  <div>
                    <button
                      type="button"
                      onClick={() => togglePreview(alert.id)}
                      className="w-full flex items-center justify-between py-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
                      aria-expanded={isPreviewExpanded}
                    >
                      <span className="text-foreground font-medium">
                        View changes preview
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-250 ease-in-out ${
                          isPreviewExpanded ? "rotate-180 text-foreground" : ""
                        }`}
                      />
                    </button>

                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-250 ease-in-out ${
                        isPreviewExpanded
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0 pointer-events-none"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="pt-2 space-y-2 text-[11.5px]">
                          {actionBefore && (
                            <div className="bg-card border border-border rounded-none p-2.5 space-y-1">
                              <span className="inline-block text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded-none">
                                Before
                              </span>
                              <p className="text-foreground leading-relaxed font-normal">
                                {actionBefore}
                              </p>
                            </div>
                          )}

                          {actionAfter && (
                            <div className="bg-muted border border-success-border rounded-none p-2.5 space-y-1">
                              <span className="inline-block text-[9.5px] font-bold uppercase tracking-wider text-brand font-mono bg-success-tint px-1.5 py-0.5 rounded-none">
                                After
                              </span>
                              <p className="text-brand leading-relaxed font-medium">
                                {actionAfter}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer: Timestamp & Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] border-t border-border">
                  <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
                    {formatAlertTimestamp(alert.timestamp)}
                  </span>

                  {isCompleted ? (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-brand bg-success-tint px-2.5 py-1 rounded-none border border-success-border">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                      Completed
                    </span>
                  ) : isError ? (
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction(alert, "manual")}
                        disabled={isManualDisabled}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 sm:px-3 py-1.5 text-foreground hover:text-foreground bg-card hover:bg-muted border border-border hover:border-input rounded-none text-xs font-medium cursor-pointer transition-all active:scale-98 disabled:opacity-50"
                      >
                        {resolvingManualId === alert.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span>Mark Done</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAction(alert, "ai")}
                        disabled={isAiDisabled}
                        className="inline-flex shrink-0 items-center justify-center whitespace-nowrap px-3 sm:px-4 py-1.5 bg-destructive hover:bg-destructive text-primary-foreground rounded-none text-xs font-semibold cursor-pointer transition-all active:scale-98 disabled:opacity-50"
                      >
                        {resolvingAiId === alert.id ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-foreground" />
                            <span>Retrying...</span>
                          </span>
                        ) : (
                          <span>Retry</span>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction(alert, "manual")}
                        disabled={isManualDisabled}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 sm:px-3 py-1.5 text-foreground hover:text-foreground bg-card hover:bg-muted border border-border hover:border-input rounded-none text-xs font-medium transition-all cursor-pointer active:scale-98 disabled:opacity-50"
                      >
                        {resolvingManualId === alert.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span>Mark Done</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAction(alert, "ai")}
                        disabled={isAiDisabled}
                        className="inline-flex shrink-0 items-center justify-center whitespace-nowrap px-3 sm:px-4 py-1.5 bg-brand hover:bg-brand-hover text-primary-foreground rounded-none text-xs font-semibold transition-all cursor-pointer active:scale-98 disabled:opacity-60 border border-brand-border"
                      >
                        {resolvingAiId === alert.id ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-foreground" />
                            <span>{isGood ? "Applying..." : "Fixing..."}</span>
                          </span>
                        ) : (
                          <span>{isGood ? "Apply with AI" : "Fix with AI"}</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
