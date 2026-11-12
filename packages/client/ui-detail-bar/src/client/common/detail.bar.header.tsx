"use client";

import React from "react";
import { PanelRightClose } from "lucide-react";
import { useSidebarStore } from "@openai-harness/client-ui-session";

interface DetailBarHeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function DetailBarHeader({
  title,
  subtitle,
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
        <button
          type="button"
          onClick={toggleRightCollapsed}
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
