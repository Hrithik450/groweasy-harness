"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect, useId, useRef } from "react";
import type { SessionView, UserView } from "@/lib/core/session/view";
import { PanelLeft, X, Settings, LogOut, UserRound } from "lucide-react";
import { useSidebarStore } from "@/store/sidebar.store";
import { useSessionStore } from "@/store/session.store";
import { useModalStore } from "@/store/modal.store";
import { useUserStore } from "@/store/user.store";

/**
 * Resolves a distinct animated bot avatar icon matching the session's agent role.
 */

const ROUND_HEAD_PATH =
  "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z";

const GEM_HEAD_PATH =
  "M227.48 114.27C227.48 114.96 227.42 115.46 227.3 116.32C226.51 120.57 225.49 124.41 224.59 127.2C222.98 131.59 221.03 136.22 218.75 141.05C216.14 146.01 213.23 151.06 210.01 156.18C206.54 161.31 202.79 166.44 198.79 171.52C194.59 176.54 190.17 181.44 185.59 186.23C180.85 190.85 175.98 195.31 171.02 199.55C165.97 203.57 160.9 207.35 155.8 210.87C150.74 214.11 145.73 217.05 140.8 219.68C136.03 221.98 131.43 223.95 127.08 225.57C123.03 226.84 119.39 227.76 116.3 228.31C114.95 228.49 114.27 228.49 114.27 228.49C113.59 228.49 112.24 228.31 109.16 227.76C105.51 226.84 101.46 225.57 97.11 223.95C92.51 221.98 87.74 219.68 82.81 217.05C77.81 214.11 72.74 210.87 67.64 207.35C62.57 203.57 57.52 199.55 52.56 195.31C47.69 190.85 42.95 186.23 38.37 181.44C33.95 176.54 29.75 171.52 25.76 166.44C22.02 161.31 18.53 156.18 15.31 151.06C12.4 146.01 9.79 141.05 7.51 136.22C5.56 131.59 3.95 127.2 2.69 123.11C1.79 119.44 1.24 116.32 1.06 114.27C1.06 113.58 1.24 112.22 1.79 109.11C2.69 105.44 3.95 101.34 5.56 96.96C7.51 92.32 9.79 87.49 12.4 82.54C15.31 77.48 18.53 72.36 22.02 67.23C25.76 62.1 29.75 57.02 33.95 52.01C38.37 47.1 42.95 42.31 47.69 37.69C52.56 33.23 57.52 28.99 62.57 24.97C67.64 21.19 72.74 17.67 77.81 14.43C82.81 11.49 87.74 8.86 92.51 6.56C97.11 4.59 101.46 2.97 105.51 1.7C109.16 0.79 112.24 0.23 114.27 0.05C114.95 0.05 116.3 0.23 119.39 0.79C123.03 1.7 127.08 2.97 131.43 4.59C136.03 6.56 140.8 8.86 145.73 11.49C150.74 14.43 155.8 17.67 160.9 21.19C165.97 24.97 171.02 28.99 175.98 33.23C180.85 37.69 185.59 42.31 190.17 47.1C194.59 52.01 198.79 57.02 202.79 62.1C206.54 67.23 210.01 72.36 213.23 77.48C216.14 82.54 218.75 87.49 221.03 92.32C222.98 96.96 224.59 101.34 225.85 105.44C226.75 109.11 227.18 111.36 227.3 112.22C227.42 113.08 227.48 113.58 227.48 114.27Z";

export function SidebarBotAvatar({
  session,
  index,
}: {
  session: SessionView;
  index: number;
}) {
  const text = (session.title || "").toLowerCase();
  const gradientKey = useId().replace(/:/g, "");
  const shellFillId = `sidebar-shell-${gradientKey}`;
  const shellRimId = `sidebar-rim-${gradientKey}`;

  let headColor = "var(--agent-green)";
  let motionClass = "animate-sidebar-inquisitive";
  let isGem = false;

  if (text.includes("strategist") || text.includes("strategy")) {
    headColor = "var(--agent-amber)";
    motionClass = "animate-sidebar-inquisitive";
  } else if (text.includes("manager") || text.includes("management")) {
    headColor = "var(--agent-violet)";
    motionClass = "animate-sidebar-scanning";
    isGem = true;
  } else if (text.includes("creator") || text.includes("creative")) {
    headColor = "var(--agent-green)";
    motionClass = "animate-sidebar-playful";
  } else {
    const colors = [
      "var(--agent-blue)",
      "var(--agent-coral)",
      "var(--agent-indigo)",
      "var(--card)",
    ];
    headColor = colors[index % colors.length];
    const motions = [
      "animate-sidebar-inquisitive",
      "animate-sidebar-scanning",
      "animate-sidebar-playful",
      "animate-sidebar-orbit",
    ];
    motionClass = motions[index % motions.length];
  }

  // Glossy shell: a lit gradient body with a rim and a blurred specular spot,
  // so the agent reads as a 3D sphere rather than a flat dot.
  const shellTop = `color-mix(in srgb, white 26%, ${headColor})`;
  const shellBottom = `color-mix(in srgb, black 26%, ${headColor})`;
  const rimTop = `color-mix(in srgb, white 34%, ${headColor})`;
  const rimBottom = `color-mix(in srgb, black 30%, ${headColor})`;

  return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0">
      <svg
        viewBox="-15 -15 259 259"
        xmlns="http://www.w3.org/2000/svg"
        className="w-7 h-7 select-none transition-[transform,filter] duration-150 ease-out group-hover:scale-105 group-hover:brightness-[1.06]"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id={shellFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: shellTop }} />
            <stop offset="100%" style={{ stopColor: shellBottom }} />
          </linearGradient>
          <linearGradient id={shellRimId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: rimTop }} />
            <stop offset="100%" style={{ stopColor: rimBottom }} />
          </linearGradient>
        </defs>
        <g
          transform="translate(114.2705 114.2705) scale(1.0405) translate(-114.2705 -114.2705)"
          style={{
            filter:
              "drop-shadow(0 3px 6px color-mix(in srgb, black 35%, transparent))",
          }}
        >
          {/* Head Shell */}
          <path
            d={isGem ? GEM_HEAD_PATH : ROUND_HEAD_PATH}
            fill={`url(#${shellFillId})`}
          />
          <path
            d={isGem ? GEM_HEAD_PATH : ROUND_HEAD_PATH}
            fill="none"
            stroke={`url(#${shellRimId})`}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {/* broad specular wash */}
          <ellipse
            cx="76"
            cy="50"
            rx="52"
            ry="32"
            fill="white"
            opacity={0.26}
            style={{ filter: "blur(7px)" }}
          />
          {/* tight hot spot */}
          <ellipse
            cx="72"
            cy="44"
            rx="22"
            ry="14"
            fill="white"
            opacity={0.38}
            style={{ filter: "blur(3px)" }}
          />

          {/* Unique Autonomous Eye Motion Cluster */}
          <g
            className={motionClass}
            style={{ transformOrigin: "114.27px 114.27px" }}
          >
            {/* Left Eye */}
            <g
              className="animate-sidebar-blink"
              style={{
                transformOrigin: "85px 114.27px",
                animationDelay: `${(index * 0.6) % 3}s`,
              }}
            >
              <line
                x1={85}
                y1={98}
                x2={85}
                y2={130}
                stroke="var(--foreground)"
                strokeWidth={20}
                strokeLinecap="round"
              />
            </g>

            {/* Right Eye */}
            <g
              className="animate-sidebar-blink"
              style={{
                transformOrigin: "143.5px 114.27px",
                animationDelay: `${((index * 0.6) % 3) + 0.05}s`,
              }}
            >
              <line
                x1={143.5}
                y1={98}
                x2={143.5}
                y2={130}
                stroke="var(--foreground)"
                strokeWidth={20}
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

const MIN_LEFT_WIDTH = 220;
const MAX_LEFT_WIDTH = 360;
const DEFAULT_LEFT_WIDTH = 260;

interface SidebarProps {
  initialSessions?: SessionView[];
  initialUser?: UserView | null;
}

export function Sidebar({
  initialSessions = [],
  initialUser = null,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);

  const resetLeftWidth = () => setLeftWidth(DEFAULT_LEFT_WIDTH);

  const { isLeftCollapsed, toggleLeftCollapsed, isMobileOpen, closeMobile } =
    useSidebarStore();

  const { sessions: storeSessions } = useSessionStore();
  const rawSessions =
    storeSessions.length > 0 ? storeSessions : initialSessions;
  const sessions = rawSessions.filter((s) => !s.hidden);

  const { openSettingsModal } = useModalStore();
  const { user: storeUser, logout } = useUserStore();
  const user = storeUser || initialUser;
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isUserMenuOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        openSettingsModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSettingsModal]);

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      const clamped = Math.max(
        MIN_LEFT_WIDTH,
        Math.min(MAX_LEFT_WIDTH, moveEvent.clientX),
      );
      setLeftWidth(clamped);
    };

    const onMouseUp = () => {
      setIsDraggingLeft(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
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
          <div className="w-8 h-8 rounded-none bg-brand-accent flex items-center justify-center text-brand shrink-0">
            <svg
              className="w-[18px] h-[18px]"
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
            <h1 className="font-display font-extrabold text-primary-foreground text-[17px] tracking-tight leading-none truncate">
              Uno
            </h1>
            <p className="text-[11px] font-normal text-brand-muted mt-0.5 leading-tight truncate">
              AI that finds winning ads
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleLeftCollapsed}
            title="Hide sidebar (⌘B)"
            className="hidden md:flex w-7 h-7 rounded-none text-brand-muted hover:text-primary-foreground hover:bg-brand-hover items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={closeMobile}
            title="Close sidebar"
            className="md:hidden w-7 h-7 rounded-none text-brand-muted hover:text-primary-foreground hover:bg-brand-hover flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Sessions List */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3.5">
        <div className="flex items-center justify-between">
          <span className="min-w-0 font-mono text-[10px] font-medium tracking-[0.14em] text-brand-muted uppercase truncate">
            Your AI Marketing Team
          </span>
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
                  {isActive && (
                    <div className="text-[11px] truncate leading-tight text-brand-muted mt-0.5 group-hover:text-brand-muted">
                      Active
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom Profile Section with Popover Menu matching Sidebar Theme */}
      <div
        className="p-3 border-t border-brand-border shrink-0 relative"
        ref={userMenuRef}
      >
        {/* Floating Menu Popover */}
        {isUserMenuOpen && (
          <div className="absolute bottom-[68px] left-3 right-3 bg-brand-surface border border-brand-border rounded-none p-1.5 z-50 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                openSettingsModal();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-none text-xs text-brand-soft hover:text-primary-foreground hover:bg-brand-hover transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-brand-muted" />
                <span className="font-medium">Settings</span>
              </div>
              <span className="text-[11px] font-mono text-brand-muted">
                ⌘ ,
              </span>
            </button>

            {user?.googleId ? (
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-none text-xs text-brand-soft hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-brand-muted" />
                <span className="font-medium">Sign out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const current =
                    typeof window !== "undefined"
                      ? `${window.location.pathname}${window.location.search}`
                      : pathname || "/c";
                  window.location.href = `/api/auth/google/login?returnTo=${encodeURIComponent(current)}`;
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-none text-xs text-primary-foreground bg-brand hover:bg-brand-hover border border-brand-border-subtle transition-all cursor-pointer font-medium"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="var(--color-provider-google-blue)"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="var(--color-provider-google-green)"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="var(--color-provider-google-yellow)"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="var(--color-provider-google-red)"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>
            )}
          </div>
        )}

        {/* User Profile Button */}
        <button
          type="button"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-none border border-brand-border hover:border-brand-border-subtle bg-brand-surface hover:bg-brand-hover transition-all cursor-pointer text-left ${
            isUserMenuOpen
              ? "ring-1 ring-brand-border-subtle bg-brand-surface"
              : ""
          }`}
        >
          {user?.googleId ? (
            user.picture ? (
              <img
                src={user.picture}
                alt={user.name || "User"}
                className="w-8 h-8 rounded-none object-cover shrink-0 border border-brand-border-subtle"
              />
            ) : (
              <div className="w-8 h-8 rounded-none bg-brand-surface text-brand-accent font-bold text-xs flex items-center justify-center shrink-0 border border-brand-border-subtle overflow-hidden">
                {(user.name || "U")[0].toUpperCase()}
              </div>
            )
          ) : (
            <div className="w-8 h-8 rounded-none bg-brand-surface text-brand-muted font-medium text-xs flex items-center justify-center shrink-0 border border-brand-border">
              <UserRound className="w-4 h-4 text-brand-muted" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-primary-foreground leading-tight truncate">
              {user?.googleId ? user.name || "User" : "Anonymous"}
            </div>
            <div className="text-[10.5px] text-brand-muted leading-tight truncate mt-0.5">
              {user?.googleId ? user.email || "" : "Guest mode"}
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-foreground/60 md:hidden"
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-brand text-primary-foreground md:hidden transition-transform duration-300 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: `${Math.min(leftWidth, 300)}px` }}
      >
        {sidebarContent}
      </div>

      {/* Desktop Persistent Sidebar */}
      <aside
        id="sidebar-left"
        style={{ width: isLeftCollapsed ? 0 : `${leftWidth}px` }}
        className={`hidden md:block relative bg-brand text-primary-foreground h-full select-none shrink-0 ${
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
                  : "bg-transparent group-hover:bg-border-strong"
              }`}
            />
          </div>
        )}
      </aside>
    </>
  );
}
