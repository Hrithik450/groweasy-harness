"use client";

/**
 * Chat header seat.
 *
 * The app's header markup and controls, unchanged. The route parameter read
 * is gone: the conversation owner passes the active `sessionId` as a prop.
 *
 * @module @openai-harness/client-ui-chat/client/ChatHeader
 */

import { Menu, PanelLeft, Plus } from "lucide-react";
import {
  useModalStore,
  useSessionStore,
  useSidebarStore,
} from "@openai-harness/client-ui-session";
import type { HeaderOwnerProps } from "./types";

/**
 * Render the conversation header.
 * @param props - active session id, optional session/title overrides.
 * @returns the header row.
 */
export function ChatHeader({
  sessionId,
  session: propSession,
  title: propTitle,
  className = "bg-card border-b border-border",
}: HeaderOwnerProps) {
  const { isLeftCollapsed, toggleLeftCollapsed, toggleMobile } =
    useSidebarStore();

  const { openNewSessionModal } = useModalStore();
  const { sessions } = useSessionStore();

  const currentSession = propSession || sessions.find((s) => s.id === sessionId);
  const title = propTitle || currentSession?.title || "Ad Specialist";

  return (
    <header
      className={`h-14 shrink-0 flex items-center justify-between z-10 px-3 sm:px-4 ${className}`}
    >
      {/* Left controls */}
      <div className="flex items-center gap-1.5 min-w-[40px]">
        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={toggleMobile}
          className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors active:scale-95 cursor-pointer"
          title="Open navigation"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>

        {/* Desktop left sidebar expand trigger when collapsed */}
        {isLeftCollapsed && (
          <button
            id="sidebar-left-open-btn"
            type="button"
            onClick={toggleLeftCollapsed}
            className="hidden md:flex p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors active:scale-95 cursor-pointer"
            title="Open sidebar (⌘B)"
            aria-label="Open navigation sidebar"
          >
            <PanelLeft size={18} />
          </button>
        )}
      </div>

      {/* Center title */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-display font-bold tracking-tight text-sm sm:text-[15px] text-foreground truncate max-w-[200px] sm:max-w-xs">
          {title}
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center justify-end gap-1.5 min-w-[40px]">
        {/* Mobile quick new session */}
        <button
          type="button"
          onClick={openNewSessionModal}
          className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors active:scale-95 cursor-pointer"
          title="New agent session"
        >
          <Plus size={18} />
        </button>
      </div>
    </header>
  );
}
