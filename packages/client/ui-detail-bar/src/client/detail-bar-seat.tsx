"use client";

/**
 * The frame-seat component registered into `rightbar`.
 *
 * It resolves the selected Session and its folded `detailBar` projection, then
 * draws the registered bar. The bar id/type comes from the session (slug wins,
 * then the projection type); the data is always `detailBar.data`. Edits go
 * through `detailBar.update` and the returned snapshot is applied to the
 * projection cache, so the card updates without a refetch.
 */
import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useDetailBar } from "@openai-harness/client-ui-session";
import { resolveDetailBarType } from "../utils";
import { getDetailBarComponent } from "./registry";
import {
  updateSessionDetailBar,
  useCurrentSession,
  useSessionStreaming,
} from "./session";
import type { SessionView } from "@openai-harness/session";

/** Detail-bar width contract, matching the previous app's right sidebar. */
const DEFAULT_RIGHT_WIDTH = 380;
const MIN_RIGHT_WIDTH = 340;
const MAX_RIGHT_WIDTH = 650;

/** Draw one session's registered bar from the folded projection. */
function ProjectedDetailBar({
  session,
  isStreaming,
}: {
  session: SessionView;
  isStreaming: boolean;
}) {
  const detailBar = useDetailBar(session.id);
  const type = resolveDetailBarType(session, detailBar.type);
  const DetailBarComponent = getDetailBarComponent(type);

  const handleUpdateData = async (newData: Partial<unknown>) => {
    const data = {
      ...(detailBar.data as Record<string, unknown>),
      ...(newData as Record<string, unknown>),
    };
    await updateSessionDetailBar(session.id, { type, data });
  };

  /**
   * Jump from a saved card back to the turn that produced it.
   *
   * The chat owns the transcript and its scroll container, so the bar only
   * announces the target; `ConversationView` anchors messages in
   * `data-message-ids` and performs the scroll.
   */
  const handleNavigation = (messageId: string) => {
    window.dispatchEvent(
      new CustomEvent("chat:jump-to-message", { detail: { messageId } }),
    );
  };

  return (
    <DetailBarComponent
      session={session}
      detailBar={{ type, data: detailBar.data }}
      isStreaming={isStreaming}
      handleUpdateData={handleUpdateData}
      handleNavigation={handleNavigation}
    />
  );
}

export function DetailBarSeat(): ReactNode {
  const session = useCurrentSession();
  const isStreaming = useSessionStreaming(session?.id);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);

  const resetRightWidth = () => setRightWidth(DEFAULT_RIGHT_WIDTH);

  /** Drag anywhere between the min and max width; double-click resets. */
  const handleStartResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    setIsDragging(true);
    const startX = event.clientX;
    const startWidth = rightWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      setRightWidth(
        Math.min(Math.max(startWidth + delta, MIN_RIGHT_WIDTH), MAX_RIGHT_WIDTH),
      );
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  if (session === null) return null;

  return (
    <aside
      data-detail-bar=""
      style={{ width: `${rightWidth}px` }}
      className={`relative h-full shrink-0 select-none bg-card border-l border-border overflow-hidden ${
        isDragging
          ? "transition-none"
          : "transition-[width] duration-200 ease-out"
      }`}
    >
      <div style={{ width: `${rightWidth}px` }} className="flex flex-col h-full">
        <ProjectedDetailBar session={session} isStreaming={isStreaming} />
      </div>

      {/* Drag Resize Handle on the left border */}
      <div
        onMouseDown={handleStartResize}
        onDoubleClick={resetRightWidth}
        title="Drag to resize details (double-click to reset)"
        className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize z-40 group flex items-center justify-center bg-transparent"
      >
        <div
          className={`w-[2px] h-8 rounded-none transition-colors ${
            isDragging
              ? "bg-success"
              : "bg-transparent group-hover:bg-border-strong"
          }`}
        />
      </div>
    </aside>
  );
}
