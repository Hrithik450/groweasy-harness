"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@/lib/db";
import {
  Megaphone,
  Palette,
  Compass,
  Sparkles,
  BarChart3,
  Target,
  Bot,
  Plus,
  PanelLeft,
  X,
} from "lucide-react";
import { useSidebarStore } from "@/store/sidebar.store";
import { useSessionStore } from "@/store/session.store";
import { useModalStore } from "@/store/modal.store";
import { SidebarBotAvatar } from "@/components/sidebar/sidebar";

/**
 * Resolves a context-aware Lucide icon matching the session's specific agent role.
 */
export function getRoleIcon(session: Session) {
  const text = (session.title || "").toLowerCase();

  if (
    text.includes("strategist") ||
    text.includes("research") ||
    text.includes("compass")
  ) {
    return <Compass className="w-4 h-4" />;
  }
  if (
    text.includes("creator") ||
    text.includes("palette") ||
    text.includes("design")
  ) {
    return <Palette className="w-4 h-4" />;
  }
  if (
    text.includes("manager") ||
    text.includes("speaker") ||
    text.includes("megaphone")
  ) {
    return <Megaphone className="w-4 h-4" />;
  }
  if (text.includes("chart") || text.includes("analytics")) {
    return <BarChart3 className="w-4 h-4" />;
  }
  if (text.includes("target")) {
    return <Target className="w-4 h-4" />;
  }
  if (text.includes("sparkle")) {
    return <Sparkles className="w-4 h-4" />;
  }
  return <Bot className="w-4 h-4" />;
}

const DEFAULT_LEFT_WIDTH = 260;

export function SidebarLeft() {
  const pathname = usePathname();
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const resetLeftWidth = () => setLeftWidth(DEFAULT_LEFT_WIDTH);

  const {
    isLeftCollapsed,
    toggleLeftCollapsed,
    isMobileOpen,
    closeMobile,
  } = useSidebarStore();

  const { sessions } = useSessionStore();
  const { openNewSessionModal } = useModalStore();

  // Handle drag-to-resize
  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      setLeftWidth(moveEvent.clientX);
    };

    const onMouseUp = () => {
      setIsDraggingLeft(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const sidebarContent = (
    <div
      style={{ width: `${leftWidth}px` }}
      className="flex flex-col justify-between h-full overflow-hidden"
    >
      {/* Header: exactly h-14, matching the UI header baseline */}
      <div className="h-14 px-4 border-b border-brand-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-honey flex items-center justify-center text-foreground shadow-xs shrink-0">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 21v-8.6"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
              />
              <path
                d="M12 12.7c-.5-3 .5-5.3 3.1-6.9.5 2.9-.7 5.4-3.1 6.9Z"
                fill="currentColor"
              />
              <path
                d="M11.5 15.6c-2.6-.1-4.5-1.4-5.6-3.8 2.5-.2 4.4 1.2 5.6 3.8Z"
                fill="currentColor"
              />
              <path
                d="M12.5 18.2c2.1-.2 3.6-1.2 4.6-3.1-2-.1-3.6 1-4.6 3.1Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-primary-foreground text-[13.5px] tracking-tight leading-none truncate">
              Uno
            </h1>
            <p className="text-[10.5px] text-muted-2 mt-1 leading-none truncate">
              AI that finds winning ads
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleLeftCollapsed}
            title="Hide sidebar (⌘B)"
            className="hidden md:flex w-7 h-7 rounded-lg text-muted-2 hover:text-primary-foreground hover:bg-brand-border items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={closeMobile}
            title="Close sidebar"
            className="md:hidden w-7 h-7 rounded-lg text-muted-2 hover:text-primary-foreground hover:bg-brand-border flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Sessions List */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3.5">
        <div className="flex items-center justify-between">
          <span className="min-w-0 text-[10.5px] font-semibold tracking-wider text-muted-2 uppercase truncate">
            Your AI Marketing Team
          </span>
          <button
            type="button"
            onClick={() => {
              closeMobile();
              openNewSessionModal();
            }}
            title="Create new agent session"
            className="w-5 h-5 rounded-md text-muted-2 hover:text-primary-foreground hover:bg-brand-border flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2 space-y-0.5">
          {sessions.map((session, index) => {
            const isActive =
              pathname === `/c/${session.id}` ||
              pathname?.startsWith(`/c/${session.id}/`);
            return (
              <Link
                key={session.id}
                href={`/c/${session.id}`}
                onClick={() => {
                  closeMobile();
                }}
                className={`w-full flex items-center gap-3 px-2 py-2 text-left transition-colors cursor-pointer group rounded-none ${
                  isActive ? "bg-brand-hover" : "hover:bg-brand-surface"
                }`}
              >
                <SidebarBotAvatar session={session} index={index} />
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <div
                    className={`text-[13px] leading-tight truncate transition-colors ${
                      isActive
                        ? "font-semibold text-primary-foreground"
                        : "font-medium text-brand-soft group-hover:text-primary-foreground"
                    }`}
                  >
                    {session.title}
                  </div>
                  <div className="text-[11px] truncate leading-tight text-brand-muted mt-0.5">
                    Active
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom Profile Section */}
      <div className="p-3 border-t border-brand-border shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-brand-border transition-colors cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-card text-foreground font-bold text-xs flex items-center justify-center shadow-inner shrink-0">
            T
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-primary-foreground leading-tight">
              Tej
            </div>
            <div className="text-[10.5px] text-muted-2 leading-tight">
              Uno
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-foreground/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-brand-surface text-primary-foreground md:hidden transition-transform duration-300 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: `${Math.min(leftWidth, 300)}px` }}
      >
        {sidebarContent}
      </div>

      {/* Desktop Persistent Sidebar */}
      <aside
        style={{ width: isLeftCollapsed ? 0 : `${leftWidth}px` }}
        className={`hidden md:block relative bg-brand-surface text-primary-foreground h-full select-none shrink-0 ${
          isLeftCollapsed
            ? "border-r-0 pointer-events-none opacity-0 overflow-hidden"
            : "border-r border-brand-border opacity-100"
        } ${isDraggingLeft ? "transition-none" : "transition-[width,opacity] duration-200 ease-out"}`}
      >
        {sidebarContent}

        {/* Drag Resize Handle */}
        {!isLeftCollapsed && (
          <div
            onMouseDown={handleStartResize}
            onDoubleClick={resetLeftWidth}
            title="Drag to resize sidebar (double-click to reset)"
            className="absolute top-0 bottom-0 -right-1.5 w-3 cursor-col-resize z-40 group flex items-center justify-center bg-transparent"
          >
            <div
              className={`w-[2px] h-8 rounded-none transition-colors ${
                isDraggingLeft
                  ? "bg-success"
                  : "bg-transparent group-hover:bg-muted-2"
              }`}
            />
          </div>
        )}
      </aside>
    </>
  );
}

