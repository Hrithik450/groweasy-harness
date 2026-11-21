"use client";

import { Menu, PanelRight } from "lucide-react";
import { useSidebarStore } from "@/store/sidebar.store";

interface ChatHeaderProps {
  title?: string;
  className?: string;
}

/** Conversation header: paper bar, ruled bottom edge, display-face title. */
export function ChatHeader({
  title = "Chief 1.5",
  className = "bg-card border-b border-border",
}: ChatHeaderProps) {
  const { toggleMobile, toggleDetailDrawer, isDetailDrawerOpen } =
    useSidebarStore();

  return (
    <header
      className={`h-14 flex-shrink-0 flex items-center justify-between z-10 px-3 sm:px-4 ${className}`}
    >
      {/* Left: mobile navigation */}
      <div className="flex items-center gap-1.5 min-w-[40px]">
        <button
          type="button"
          onClick={toggleMobile}
          className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors active:scale-95 cursor-pointer"
          title="Open navigation"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Center: title */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-display font-bold tracking-tight text-sm sm:text-[15px] text-foreground truncate max-w-[200px] sm:max-w-xs">
          {title}
        </span>
      </div>

      {/* Right: detail drawer toggle wherever the column is not used */}
      <div className="flex items-center justify-end gap-1.5 min-w-[40px]">
        <button
          type="button"
          onClick={toggleDetailDrawer}
          className={`xl:hidden p-2 rounded-none transition-colors active:scale-95 cursor-pointer ${
            isDetailDrawerOpen
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
          title={isDetailDrawerOpen ? "Close details" : "Open details"}
          aria-label={isDetailDrawerOpen ? "Close details" : "Open details"}
          aria-expanded={isDetailDrawerOpen}
        >
          <PanelRight size={18} />
        </button>
      </div>
    </header>
  );
}
