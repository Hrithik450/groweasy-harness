"use client";

import React from "react";
import { Settings, X } from "lucide-react";
import { useSidebarStore } from "@/store/sidebar.store";
import { useModalStore } from "@/store/modal.store";

interface SidebarHeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function SidebarHeader({
  title,
  subtitle,
  children,
}: SidebarHeaderProps) {
  const { openScheduleModal } = useModalStore();
  const { toggleRightCollapsed } = useSidebarStore();

  return (
    <div className="h-14 border-b border-border/80 px-4 shrink-0 flex items-center justify-between select-none">
      <div className="flex items-center gap-6 h-full min-w-0">
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
          onClick={openScheduleModal}
          title="Schedule Settings"
          className="w-7 h-7 rounded-lg text-muted-2 hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleRightCollapsed}
          title="Collapse sidebar"
          className="w-7 h-7 rounded-lg text-muted-2 hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
