/**
 * The `detailBar` projection unit.
 *
 * A session's right-hand panel is a fold over the committed log, never a
 * mutable per-session bag. Every writer appends one whole-value
 * `detailBar/update`; the fold replaces the previous state with the event's
 * payload and returns the same reference for every other event, so the
 * framework's change detection stays O(1) per committed event.
 *
 * The unit is client-safe: both the gateway and the browser bundle register
 * the same definition, so a server snapshot and a client tail-fold produce
 * the same state from the same log.
 *
 * @module @openai-harness/session-projection/projections/detail.bar
 */

import { z } from "zod";
import type { SessionEvent, SessionHeader } from "@openai-harness/session";
import type { ProjectionDefinition } from "./types";

/** The whole detail-bar state carried by every `detailBar/update` event. */
export interface DetailBarState {
  /** Which preset bar the session renders (`adStrategist`, `adManager`, …). */
  type: string;
  /** The preset-owned data slice. Opaque to the framework. */
  data: Record<string, unknown>;
}

/** Validates a whole-value payload before it is folded, cached, or restored. */
export const detailBarStateSchema: z.ZodType<DetailBarState> = z.object({
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
});

/** Current detail-bar state version; bump when `DetailBarState` changes. */
export const DETAIL_BAR_STATE_VERSION = 1;

/** The bare state a session starts from before any writer runs. */
export function emptyDetailBarState(type = "default"): DetailBarState {
  return { type, data: {} };
}

/**
 * Fold committed events into the whole-value detail-bar state.
 *
 * Irrelevant events return the input reference unchanged. A malformed
 * payload is skipped rather than corrupting the bar; the writer's own
 * validation is expected to reject it before append.
 */
export function foldDetailBarEvents(
  state: DetailBarState,
  events: readonly SessionEvent[],
): DetailBarState {
  let next = state;
  for (const event of events) {
    if (event.type !== "detailBar/update") continue;
    const parsed = detailBarStateSchema.safeParse(event.data.detailBar);
    if (parsed.success) next = parsed.data;
  }
  return next;
}

/** The registered unit; `init` resolves the bar type from the preset. */
export const detailBarProjection: ProjectionDefinition<
  "detailBar",
  DetailBarState
> = {
  key: "detailBar",
  stateVersion: DETAIL_BAR_STATE_VERSION,
  stateSchema: detailBarStateSchema,
  init: (header: SessionHeader) =>
    emptyDetailBarState(header.agentPreset ?? "default"),
  apply: (state, event) => foldDetailBarEvents(state, [event]),
};
