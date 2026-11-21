"use client";

import type { SessionView } from "@/lib/core/session/view";
import React, { useRef, useState } from "react";
import { Loader2, ChevronLeft } from "lucide-react";
import { useSidebarStore } from "@/store/sidebar.store";
import { DetailBarSlug } from "@/lib/detail.bar";
import type { DetailBarState } from "@/lib/detail.bar/state";
import {
  isDetailBarField,
  topDetailBarFieldsOf,
  type DetailBarField,
} from "@/lib/detail.bar/fields";
import { readPage, useDetailBarStore } from "@/store/detail.bar.store";
import { DetailBarStream } from "@/components/detail.bar/detail.bar.stream";
import { getDetailBarComponent } from "@/components/detail.bar/registry";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

const MIN_RIGHT_WIDTH = 400;
const MAX_RIGHT_WIDTH = 580;
const DEFAULT_RIGHT_WIDTH = 420;

export interface DetailBarProps {
  session: SessionView;
  initialData?: DetailBarState;
  isStreaming?: boolean;
  handleSubmit?: (
    content: string,
    options?: { source?: import("@/lib/session/prompt").PromptSource },
  ) => Promise<void> | void;
  handleNavigation?: (
    messageId: string,
    options?: import("@/components/detail.bar/registry").DetailBarNavigationOptions,
  ) => void;
}

export function DetailBar({
  session,
  initialData,
  isStreaming = false,
  handleSubmit,
  handleNavigation,
}: DetailBarProps) {
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);

  const { isRightCollapsed, toggleRightCollapsed } = useSidebarStore();
  const resetRightWidth = () => setRightWidth(DEFAULT_RIGHT_WIDTH);

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      const rawWidth = window.innerWidth - moveEvent.clientX;
      const clamped = Math.max(
        MIN_RIGHT_WIDTH,
        Math.min(MAX_RIGHT_WIDTH, rawWidth),
      );
      setRightWidth(clamped);
    };

    const onMouseUp = () => {
      setIsDraggingRight(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  /**
   * Apply a bar update locally, and persist it when it names one row.
   *
   * A row patch goes through `POST /detail.bar`: the server merges only the fields the
   * user owns, appends the event, and re-derives the projection.
   */
  const handleUpdateData = async (item: {
    id: string;
    kind: DetailBarField;
    patch: Record<string, unknown>;
  }) => {
    const res = await fetch(`/api/sessions/${session.id}/detail.bar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? "Failed to save the change");
    }

    const body = (await res.json().catch(() => null)) as {
      field?: string;
      parentId?: string | null;
      item?: unknown;
    } | null;
    if (body?.item && isDetailBarField(body.field)) {
      useDetailBarStore
        .getState()
        .setItem(body.field, body.parentId ?? null, body.item);
    }
  };

  const type = session.slug as DetailBarSlug;
  const DetailBarComponent = type ? getDetailBarComponent(type) : null;

  const hydratedSession = useRef<string | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!session?.id || !type) return;

    if (hydratedSession.current !== session.id) {
      hydratedSession.current = session.id;
      useDetailBarStore.getState().reset();
    }

    const store = useDetailBarStore.getState();
    const snapshot = (
      initialData as
        | Record<string, Record<string, unknown> | undefined>
        | undefined
    )?.[type];
    for (const field of topDetailBarFieldsOf(type)) {
      if (readPage(store.pages, field)) continue;
      const page = snapshot?.[field];
      if (Array.isArray(page)) store.replacePage(field, null, page);
    }
  }, [initialData, session?.id, type]);

  return (
    <>
      <DetailBarStream sessionId={session.id} />

      {/* Pull-back trigger tab on screen edge when collapsed */}
      {isRightCollapsed && (
        <button
          id="detailbar-pull-tab"
          type="button"
          onClick={toggleRightCollapsed}
          title="Open details"
          aria-label="Open details"
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-card hover:bg-muted border border-r-0 border-border-strong hover:border-brand/40 shadow-sm hover:shadow-md rounded-l-xl py-3 px-1.5 flex flex-col items-center gap-2 text-muted-foreground hover:text-brand transition-all cursor-pointer group active:scale-95"
        >
          <ChevronLeft className="w-4 h-4 text-muted-2 group-hover:text-brand group-hover:-translate-x-0.5 transition-transform" />
          <span className="[writing-mode:vertical-rl] text-[9.5px] font-bold tracking-wider uppercase text-muted-2 group-hover:text-brand select-none rotate-180">
            Details
          </span>
        </button>
      )}

      <aside
        id="detailbar"
        style={{ width: isRightCollapsed ? 0 : `${rightWidth}px` }}
        className={`relative bg-card h-full select-none shrink-0 ${
          isRightCollapsed
            ? "border-l-0 pointer-events-none opacity-0 overflow-hidden"
            : "border-l border-border-subtle opacity-100"
        } ${
          isDraggingRight
            ? "transition-none"
            : "transition-[width,opacity] duration-200 ease-out"
        }`}
      >
        {/* Drag Resize Handle on left border with generous grab hitbox */}
        {!isRightCollapsed && (
          <div
            onMouseDown={handleStartResize}
            onDoubleClick={resetRightWidth}
            title="Drag to resize (double-click to reset)"
            className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize z-40 group flex items-center justify-center bg-transparent"
          >
            <div
              className={`w-[2px] h-8 rounded-none transition-colors ${
                isDraggingRight
                  ? "bg-success"
                  : "bg-transparent group-hover:bg-border-strong"
              }`}
            />
          </div>
        )}

        <div
          style={{ width: `${rightWidth}px` }}
          className="flex flex-col h-full overflow-hidden"
        >
          {!session || !DetailBarComponent ? (
            <div className="h-full flex flex-col items-center justify-center p-8 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <p className="text-xs text-muted-2 font-medium">
                Loading session data...
              </p>
            </div>
          ) : (
            <DetailBarComponent
              session={session}
              isStreaming={isStreaming}
              handleSubmit={handleSubmit}
              handleUpdateData={handleUpdateData}
              handleNavigation={handleNavigation}
            />
          )}
        </div>
      </aside>
    </>
  );
}
