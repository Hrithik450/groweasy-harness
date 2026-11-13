/**
 * Session-store bridge.
 *
 * The browser session and sidebar stores are owned by
 * `@openai-harness/client-ui-session`; this package only reads them for the
 * selected session's identity (id, slug, title). Bar data is a committed
 * projection: edits append a `detailBar/update` through `detailBar.update`
 * and apply the returned snapshot to the shared projection cache. Refreshes
 * re-read `session.projection`; no caller writes or reads a mutable session
 * field.
 */
import { useSyncExternalStore } from "react";
import {
  applyProjectionSnapshot,
  resolveRpcClient,
  useSessionStore,
} from "@openai-harness/client-ui-session";
import type { SessionView } from "@openai-harness/session";

/** Whole-value detail-bar state accepted by `detailBar.update`. */
export interface DetailBarUpdateValue {
  type: string;
  data: Record<string, unknown>;
}

/** Read the route-selected session id (`/c/<sessionId>`). */
function selectedSessionId(pathname: string): string | undefined {
  return pathname.match(/\/c\/([^/]+)/)?.[1];
}

/**
 * Re-read the pathname whenever browser history moves. The shell switches
 * sessions with `pushState` plus a `popstate` event, so this binding sees
 * both real back/forward navigation and in-app session switches.
 */
function subscribeToPath(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function pathnameSnapshot(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

/**
 * The Session the detail bar should draw: the Session selected by the current
 * route. The frame owns the right column and passes no Session down, so the
 * route is the source of truth.
 * @returns the current Session view, or `null` while none is selected.
 */
export function useCurrentSession(): SessionView | null {
  const sessions = useSessionStore((state) => state.sessions);
  const pathname = useSyncExternalStore(
    subscribeToPath,
    pathnameSnapshot,
    () => "",
  );
  const id = selectedSessionId(pathname);
  return sessions.find((session) => session.id === id) ?? null;
}

/**
 * Whether the given Session is streaming.
 * @param sessionId - the Session to inspect.
 * @returns its streaming flag.
 */
export function useSessionStreaming(sessionId: string | undefined): boolean {
  return useSessionStore((state) => {
    const streaming = state.streamingSessions as
      | Record<string, boolean>
      | undefined;
    return sessionId === undefined ? false : Boolean(streaming?.[sessionId]);
  });
}

/**
 * Commit one whole-value detail-bar state and apply the returned snapshot to
 * the local projection cache, so the bar updates without waiting for the
 * follow stream or refetching the session.
 * @param sessionId - the Session whose detail bar is being edited.
 * @param detailBar - the complete next state (current data merged with patch).
 */
export async function updateSessionDetailBar(
  sessionId: string,
  detailBar: DetailBarUpdateValue,
): Promise<void> {
  const snapshot = await resolveRpcClient().call("detailBar.update", {
    sessionId,
    detailBar,
  });
  applyProjectionSnapshot(sessionId, "detailBar", snapshot);
}

/**
 * Re-read the detail-bar projection from the gateway and replace the cached
 * snapshot. Used by the tabs' explicit refresh affordances.
 * @param sessionId - the Session whose projection should be re-read.
 */
export async function refreshSessionDetailBar(sessionId: string): Promise<void> {
  const snapshot = await resolveRpcClient().call("session.projection", {
    sessionId,
    key: "detailBar",
  });
  applyProjectionSnapshot(sessionId, "detailBar", snapshot);
}
