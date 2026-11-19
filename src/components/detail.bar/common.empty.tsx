"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface DetailBarEmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Empty state for a detail-bar tab: a muted card, not bare text.
 *
 * The bordered block keeps the panel from reading as unfinished when a
 * session has no data yet.
 */
export function DetailBarEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: DetailBarEmptyStateProps) {
  return (
    <div
      className={`p-5 sm:p-6 border border-border rounded-none bg-muted text-center space-y-2 ${className}`}
    >
      {Icon ? <Icon className="w-6 h-6 text-muted-foreground mx-auto" /> : null}
      <h4 className="text-sm font-semibold text-foreground">
        {title ?? "Nothing here yet"}
      </h4>
      {description ? (
        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
