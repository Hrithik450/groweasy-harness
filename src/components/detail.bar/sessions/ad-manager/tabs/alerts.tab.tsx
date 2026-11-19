"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useDetailBarStore } from "@/store/detail.bar.store";
import { buildAlertPrompt } from "@/lib/prompts/alert";
import { formatAlertTimestamp } from "@/lib/utils/date";
import { GenerativeUIRenderer } from "@/components/generative.ui";
import type {
  Alert,
  DetailBarTabProps,
  AdManagerDetailBarData,
} from "@/lib/detail.bar/types";
import { useBarPager } from "@/hooks/use.bar.pager";
import {
  DetailBarEmptyState,
  DetailBarLoadOlder,
} from "@/components/detail.bar/common";

type FilterType = "all" | "pending" | "completed";

const FILTER_OPTIONS: { id: FilterType; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "pending", label: "NEEDS ACTION" },
  { id: "completed", label: "RESOLVED" },
];

export function AlertsTab({
  session,
  data,
  isStreaming,
  handleSubmit,
  handleUpdateData,
}: DetailBarTabProps<AdManagerDetailBarData>) {
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>(data?.alerts || []);

  useEffect(() => {
    setActiveAlerts(data?.alerts || []);
  }, [data?.alerts]);

  const pager = useBarPager(session?.id ?? "", "alerts", activeAlerts);

  const visibleAlerts = useMemo(() => {
    const seen = new Set<string>();
    return pager.items.filter((alert) => {
      if (seen.has(alert.id)) return false;
      seen.add(alert.id);
      return true;
    });
  }, [pager.items]);

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

  const filteredAlerts = visibleAlerts.filter((a) => {
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
      const res = await fetch(`/api/sessions/${session.id}/bar?field=alerts`);
      if (!res.ok) throw new Error(`bar refresh ${res.status}`);

      const page = (await res.json()) as { items?: unknown[] };
      if (Array.isArray(page.items)) {
        useDetailBarStore
          .getState()
          .applyRows(session.id, "alerts", page.items ?? []);
      }
      toast.success("Alerts refreshed");
    } catch (err) {
      console.error("Failed to refresh alerts:", err);
      toast.error("Failed to refresh alerts");
    } finally {
      setIsRefreshing(false);
    }
  };

  /** Hand the alert to the agent as a hidden prompt. */
  const handleFixWithAi = async (alert: Alert) => {
    if (isStreaming || resolvingAiId) return;
    setResolvingAiId(alert.id);
    try {
      await handleSubmit?.(buildAlertPrompt(alert), { source: "detail-bar" });
      toast.success(`Dispatched AI fix for "${alert.title}"`);
    } catch (err) {
      console.error("Failed to trigger alert remediation:", err);
      toast.error("Failed to trigger alert remediation.");
    } finally {
      setResolvingAiId(null);
    }
  };

  const handleDismiss = async (alert: Alert) => {
    if (resolvingManualId === alert.id || resolvingAiId === alert.id) return;
    setResolvingManualId(alert.id);
    try {
      const updated = visibleAlerts.map((item) =>
        item.id === alert.id
          ? {
              ...item,
              status: "completed" as const,
              error: "Dismissed by user.",
            }
          : item,
      );
      setActiveAlerts(updated);
      await handleUpdateData?.(
        { alerts: updated },
        {
          id: alert.id,
          kind: "alerts",
          patch: { status: "completed", error: "Dismissed by user." },
        },
      );
      toast.success("Alert dismissed");
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
      toast.error("Failed to dismiss alert");
    } finally {
      setResolvingManualId(null);
    }
  };

  return (
    <div className="space-y-1.5 pb-6">
      {/* Action Row: Refresh & Filter Dropdown, only once there are alerts */}
      {visibleAlerts.length > 0 && (
      <div className="flex items-center justify-end gap-1.5 pb-0.5">
        {session?.id && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1 text-muted-2 hover:text-foreground bg-card hover:bg-muted rounded-lg border border-border transition-colors cursor-pointer shadow-2xs disabled:opacity-60"
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
            className="px-2.5 py-1 border border-border rounded-lg text-[12px] font-medium text-foreground/80 bg-card hover:bg-muted transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <span>{currentFilterLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-2" />
          </button>

          {showFilterMenu && (
            <div className="absolute right-0 mt-1 w-36 bg-card border border-border rounded-xl shadow-lg py-1 z-30">
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
      )}

      {/* Alert Cards List */}
      {visibleAlerts.length === 0 ? (
        <DetailBarEmptyState
          icon={AlertCircle}
          title="No Alerts Yet"
          description="Alerts appear here once the assistant scans your ad account."
        />
      ) : filteredAlerts.length === 0 ? (
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
                className="border border-border bg-card rounded-2xl p-4 space-y-3 transition-all shadow-2xs hover:shadow-xs hover:border-border-strong"
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
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-none bg-success-tint text-brand border border-success-border">
                        <CheckCircle2 className="w-3 h-3 text-brand" />
                        Resolved
                      </span>
                    ) : isError ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-none bg-destructive-tint text-destructive border border-destructive-border">
                        <XCircle className="w-3 h-3 text-destructive-strong" />
                        Failed
                      </span>
                    ) : isCritical ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-none bg-destructive-tint text-destructive border border-destructive-border">
                        <AlertCircle className="w-3 h-3 text-destructive-strong" />
                        Critical
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-none bg-warning-tint text-warning border border-warning-border">
                        <AlertTriangle className="w-3 h-3 text-warning-strong" />
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
                    <div className="bg-muted/40 border border-border-subtle rounded-xl p-2.5 overflow-hidden">
                      <GenerativeUIRenderer
                        spec={alert.chart as Record<string, unknown>}
                        scopeId={`alert-chart-${alert.id}`}
                      />
                    </div>
                  )}

                {/* Recommended Action */}
                {actionFix && (
                  <div className="bg-muted border border-border-subtle rounded-xl p-3 text-[12.5px]">
                    <p className="text-foreground leading-relaxed font-medium line-clamp-1">
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
                      <span className="text-foreground/80 font-medium">
                        View changes preview
                      </span>
                      <ChevronDown
                        className={`shrink-0 w-3.5 h-3.5 text-muted-2 transition-transform duration-250 ease-in-out ${
                          isPreviewExpanded
                            ? "rotate-180 text-foreground/80"
                            : ""
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
                            <div className="bg-card border border-border rounded-xl p-2.5 space-y-1 shadow-2xs">
                              <span className="inline-block text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                Before
                              </span>
                              <p className="text-foreground/80 leading-relaxed font-normal">
                                {actionBefore}
                              </p>
                            </div>
                          )}

                          {actionAfter && (
                            <div className="bg-success-tint/40 border border-success-border rounded-xl p-2.5 space-y-1 shadow-2xs">
                              <span className="inline-block text-[9.5px] font-bold uppercase tracking-wider text-brand font-mono bg-success-tint px-1.5 py-0.5 rounded">
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

                {/* Resolution / Failure Note */}
                {alert.note && (
                  <div
                    className={`p-3 rounded-xl text-[12px] leading-relaxed border flex items-start gap-2.5 ${
                      isCompleted
                        ? "bg-muted border-success-border text-brand"
                        : isError
                          ? "bg-destructive-tint/70 border-destructive-border/80 text-destructive"
                          : "bg-muted border-border text-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                    ) : isError ? (
                      <XCircle className="w-4 h-4 text-destructive-strong shrink-0 mt-0.5" />
                    ) : null}
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <span className="font-semibold block text-[10px] uppercase tracking-wider text-brand font-mono">
                        {isCompleted
                          ? "Resolution Details"
                          : isError
                            ? "Failure Reason"
                            : "Note"}
                      </span>
                      <p className="font-normal text-foreground/80">
                        {alert.note}
                      </p>
                    </div>
                  </div>
                )}

                {/* Footer: Timestamp & Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] border-t border-border-subtle">
                  <span className="shrink-0 text-[11px] text-muted-2 font-medium">
                    {formatAlertTimestamp(alert.createdAt)}
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
                        onClick={() => handleDismiss(alert)}
                        disabled={isManualDisabled}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-foreground/80 hover:text-foreground bg-card hover:bg-muted border border-border hover:border-border-strong rounded-xl text-xs font-medium transition-all cursor-pointer shadow-2xs active:scale-98 disabled:opacity-50"
                      >
                        {resolvingManualId === alert.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        ) : null}
                        <span>Dismiss</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleFixWithAi(alert)}
                        disabled={isAiDisabled}
                        className="inline-flex items-center justify-center px-4 py-1.5 bg-brand hover:bg-brand-hover text-primary-foreground rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-98 disabled:opacity-60 border border-brand-border/30"
                      >
                        {resolvingAiId === alert.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-foreground" />
                            <span>Fixing...</span>
                          </span>
                        ) : (
                          <span>Fix with AI</span>
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

      <DetailBarLoadOlder
        hasMore={pager.hasMore}
        isLoading={pager.isLoading}
        onLoadMore={pager.loadMore}
      />
    </div>
  );
}
