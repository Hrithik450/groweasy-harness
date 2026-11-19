"use client";

import type { ReactNode } from "react";

export interface SidebarHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}

/** Shared header used by every detail-bar session panel. */
export function SidebarHeader({
  title,
  subtitle,
  action,
  children,
}: SidebarHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      {children ? (
        <div className="min-w-0 flex-1">{children}</div>
      ) : (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {title ?? "Untitled"}
          </div>
          {subtitle ? (
            <div className="truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </div>
      )}
      {action}
    </div>
  );
}
