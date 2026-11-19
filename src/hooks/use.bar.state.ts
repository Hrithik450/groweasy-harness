"use client";

/**
 * The detail bar as the server last computed it.
 *
 * The client never folds tool results; it shows the pushed projection when one
 * has arrived and the server-rendered checkpoint before that.
 *
 * @module @/hooks/use.bar.state
 */

import { useMemo } from "react";
import { useDetailBarStore } from "@/store/detail.bar.store";
import type { DetailBarState } from "@/lib/detail.bar/state";

const EMPTY_GROUP: Record<string, unknown> = {};

/** One session's bar slice, selected by its bar type. */
export function useBarState(
  sessionId: string,
  type: string,
  initial?: DetailBarState,
): Record<string, unknown> {
  const stored = useDetailBarStore((state) =>
    (state.states[sessionId] as Record<string, unknown> | undefined)?.[type],
  );
  const initialGroup = (initial as Record<string, unknown> | undefined)?.[
    type
  ];

  return useMemo(
    () =>
      (stored as Record<string, unknown> | undefined) ??
      (initialGroup as Record<string, unknown> | undefined) ??
      EMPTY_GROUP,
    [stored, initialGroup],
  );
}
