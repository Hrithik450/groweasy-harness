/**
 * Sidebar occupant for the layout-owned `sidebar` slot.
 *
 * Markup, Tailwind classes, drag-resize geometry, mobile drawer behaviour,
 * and the profile popover are moved verbatim from the app-side
 * `src/components/sidebar/sidebar.tsx`. Only the host seams changed:
 *
 * - `next/link` → `<a href>` plus an optional shell `onNavigate`;
 * - `next/navigation` `usePathname()` → {@link useRoutePath};
 * - relative sign-in navigation → {@link googleLoginUrl} on the gateway origin;
 * - app stores → `@openai-harness/client-ui-session` hooks only;
 * - app modal store → optional host bindings, with session actions routed
 *   through `@openai-harness/client-rpc`.
 */
import {
  useState,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Plus,
  PanelLeft,
  X,
  Settings,
  LogOut,
  UserRound,
} from "lucide-react";
import {
  useSessionStore,
  useSidebarStore,
  useUserStore,
} from "@openai-harness/client-ui-session";
import { SidebarBotAvatar } from "./avatar";
import { useRoutePath } from "./route";
import { googleLoginUrl } from "./auth";
import {
  createSession,
  listSessions,
  selectSession,
} from "./session-rpc";
import type { SidebarRootProps } from "./contract/slots";

const MIN_LEFT_WIDTH = 220;
const MAX_LEFT_WIDTH = 360;
const DEFAULT_LEFT_WIDTH = 260;

export function Sidebar({
  initialSessions = [],
  initialUser = null,
  pathname: pathnameProp,
  onNavigate,
  onOpenSettings,
  onNewSession,
}: SidebarRootProps) {
  const routePathname = useRoutePath(pathnameProp);
  const pathname = pathnameProp ?? routePathname;
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);

  const resetLeftWidth = () => setLeftWidth(DEFAULT_LEFT_WIDTH);

  const {
    isLeftCollapsed,
    toggleLeftCollapsed,
    isMobileOpen,
    closeMobile,
  } = useSidebarStore();

  const { sessions: storeSessions } = useSessionStore();
  const rawSessions = storeSessions.length > 0 ? storeSessions : initialSessions;
  const sessions = rawSessions.filter((s) => !s.hidden);

  const { user: storeUser, logout } = useUserStore();
  const user = storeUser || initialUser;
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Session listing is a gateway action, not an app-side fetch.
  useEffect(() => {
    let active = true;
    void listSessions()
      .then((rows) => {
        if (active) useSessionStore.getState().setSessions(rows);
      })
      .catch((error: unknown) => {
        console.error("[ui-sidebar] failed to list sessions", error);
      });
    return () => {
      active = false;
    };
  }, []);

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
        onOpenSettings?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenSettings]);

  const navigate = (href: string) => {
    if (onNavigate) onNavigate(href);
    else window.location.href = href;
  };

  const startNewSession = () => {
    closeMobile();
    if (onNewSession) {
      onNewSession();
      return;
    }
    void createSession()
      .then((created) => {
        useSessionStore.getState().addSession(created);
        navigate(`/c/${created.id}`);
      })
      .catch((error: unknown) => {
        console.error("[ui-sidebar] failed to create session", error);
      });
  };

  const handleStartResize = (e: ReactMouseEvent<HTMLDivElement>) => {
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
              {/* Stem */}
              <path
                d="M12 21v-8.6"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
              />
              {/* Top leaf */}
              <path
                d="M12 12.7c-.5-3 .5-5.3 3.1-6.9.5 2.9-.7 5.4-3.1 6.9Z"
                fill="currentColor"
              />
              {/* Lower-left leaf */}
              <path
                d="M11.5 15.6c-2.6-.1-4.5-1.4-5.6-3.8 2.5-.2 4.4 1.2 5.6 3.8Z"
                fill="currentColor"
              />
              {/* Lower-right leaf */}
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
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-brand-muted uppercase truncate">
            Your AI Marketing Team
          </span>
          <button
            type="button"
            onClick={startNewSession}
            title="Create new agent session"
            className="w-5 h-5 rounded-none text-brand-muted hover:text-primary-foreground hover:bg-brand-hover flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2 space-y-0.5">
          {sessions.map((session, index) => {
            const isActive =
              pathname === `/c/${session.id}` ||
              pathname?.startsWith(`/c/${session.id}/`);
            const href = `/c/${session.id}`;

            return (
              <a
                key={session.id}
                href={href}
                onClick={(event) => {
                  closeMobile();
                  // A full-page navigation can cancel this inspect request;
                  // the link itself still opens the session.
                  void selectSession(session.id).catch(() => {});
                  if (onNavigate) {
                    event.preventDefault();
                    onNavigate(href);
                  }
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
              </a>
            );
          })}
        </div>
      </div>

      {/* Bottom Profile Section with Popover Menu matching Sidebar Theme */}
      <div className="p-3 border-t border-brand-border shrink-0 relative" ref={userMenuRef}>
        {/* Floating Menu Popover */}
        {isUserMenuOpen && (
          <div className="absolute bottom-[68px] left-3 right-3 bg-brand-surface border border-brand-border rounded-none p-1.5 z-50 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onOpenSettings?.();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-none text-xs text-brand-soft hover:text-primary-foreground hover:bg-brand-hover transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-brand-muted" />
                <span className="font-medium">Settings</span>
              </div>
              <span className="text-[11px] font-mono text-brand-muted">⌘ ,</span>
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
                      : (pathname || "/c");
                  window.location.href = googleLoginUrl(current);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-none text-xs text-primary-foreground bg-brand hover:bg-brand-hover border border-brand-border-subtle transition-all cursor-pointer font-medium"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="var(--provider-google-blue)"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="var(--provider-google-green)"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="var(--provider-google-yellow)"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="var(--provider-google-red)"
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
            isUserMenuOpen ? "ring-1 ring-brand-border-subtle bg-brand-surface" : ""
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
