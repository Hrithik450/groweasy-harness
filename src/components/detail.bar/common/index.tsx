"use client";

import React from "react";
import { PanelRightClose, RefreshCw } from "lucide-react";
import { useSidebarStore } from "@/store/sidebar.store";
import { useBarRefresh } from "@/hooks/use.bar.refresh";
import type { DetailBarField } from "@/lib/detail.bar/fields";

interface DetailBarHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export function DetailBarHeader({
  title,
  subtitle,
  action,
  children,
}: DetailBarHeaderProps) {
  const { toggleRightCollapsed } = useSidebarStore();

  return (
    <div className="h-14 border-b border-border px-4 shrink-0 flex items-center justify-between select-none gap-2">
      <div className="flex items-center h-full min-w-0 flex-1 overflow-hidden">
        {children ? (
          children
        ) : (
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13.5px] font-semibold text-foreground leading-tight truncate">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {action}
        <button
          type="button"
          onClick={toggleRightCollapsed}
          data-detail-bar-collapse
          title="Collapse details"
          aria-label="Collapse details"
          className="w-7 h-7 rounded-none text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center transition-colors cursor-pointer"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface DetailBarRefreshProps {
  sessionId: string | undefined;
  field: DetailBarField;
  /** Used in the toast and the button's accessible name. */
  label: string;
  /** Show the word "Refresh"; omit in tight headers. */
  showLabel?: boolean;
}

/** Reloads the active tab from the server, replacing its seeded page. */
export function DetailBarRefresh({
  sessionId,
  field,
  label,
  showLabel = false,
}: DetailBarRefreshProps) {
  const { isRefreshing, refresh } = useBarRefresh(sessionId, field, label);

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={isRefreshing}
      title={`Refresh ${label}`}
      aria-label={`Refresh ${label}`}
      className="flex h-7 shrink-0 items-center gap-1.5 px-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
    >
      <RefreshCw
        className={`w-4 h-4 ${isRefreshing ? "animate-spin text-brand" : ""}`}
      />
      {showLabel && <span>Refresh</span>}
    </button>
  );
}

export { DetailBarEmptyState, type DetailBarEmptyStateProps } from "./empty";
export { DetailBarLoadOlder, type DetailBarLoadOlderProps } from "./load.older";
