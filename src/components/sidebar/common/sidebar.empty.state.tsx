"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

interface SidebarEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function SidebarEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: SidebarEmptyStateProps) {
  return (
    <div
      className={`p-5 sm:p-6 border border-border-subtle rounded-2xl bg-linen text-center space-y-2 shadow-2xs ${className}`}
    >
      <Icon className="w-6 h-6 text-muted-2 mx-auto" />
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
        {description}
      </p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
