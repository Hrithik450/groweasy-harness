/**
 * Client-safe session view assembly.
 *
 * Everything here operates on the wire-safe `SessionView` shape and the
 * committed event log. No storage row, repository, or database handle is
 * involved, so the same functions run in a browser hook and on the server.
 *
 * `assembleSessionView` is the single composition point: fold durable turns,
 * add prompts still in flight, overlay the open assistant step, and fold the
 * client-visible session field (`session/title`).
 *
 * Per-bar state is not part of the session view: `detailBar` is its own
 * projection over the same committed log (`./projections/detail.bar`).
 *
 * @module @openai-harness/session-projection/view
 */

import type { SessionEvent, SessionView } from "@openai-harness/session";
import type { AssistantStreamOverlay, OptimisticPrompt } from "./derive/live";
import {
  pendingPrompts,
  withAssistantStream,
  withOptimisticPrompts,
} from "./derive/live";
import { foldEventsToTurns } from "./derive/turns";
import type { TurnNode } from "./derive/types";

/** Client-visible session fields a caller may already hold. */
export interface SessionViewBase {
  readonly title?: string;
}

/** Session fields folded from the committed log. */
export interface SessionViewEventFold {
  readonly title?: string;
  /** Event time of the last folded event, as an ISO timestamp. */
  readonly updatedAt?: string;
}

/**
 * Fold the client-visible session fields from the log.
 *
 * The newest `session/title` wins. Every other event only advances
 * `updatedAt`; projections such as `detailBar` fold their own events.
 */
export function foldSessionViewEvents(
  events: readonly SessionEvent[],
  base: SessionViewBase = {},
): SessionViewEventFold {
  let title = base.title;
  let updatedAt: string | undefined;

  for (const event of events) {
    updatedAt = new Date(event.time).toISOString();

    if (event.type === "session/title") {
      title = event.data.title;
    }
  }

  return {
    ...(title === undefined ? {} : { title }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

/**
 * Apply the log's client-visible fields to a wire session.
 *
 * @param view - the session as delivered by the host.
 * @param events - committed events for that session.
 * @returns the view with title and updatedAt folded from the log.
 */
export function applySessionViewEvents(
  view: SessionView,
  events: readonly SessionEvent[],
): SessionView {
  const folded = foldSessionViewEvents(events, view);
  return {
    ...view,
    title: folded.title ?? view.title,
    updatedAt: folded.updatedAt ?? view.updatedAt,
  };
}

/** Optional live inputs for {@link assembleSessionView}. */
export interface AssembleSessionViewOptions {
  /** Prompts submitted but not yet committed; already-committed ones drop. */
  readonly prompts?: readonly OptimisticPrompt[];
  /** Assistant text of the open step. */
  readonly assistantStream?: AssistantStreamOverlay;
  /** Keep completed process folds open. Defaults to collapsing them. */
  readonly defaultCollapsedCompleted?: boolean;
}

/** One client-safe session snapshot: the wire view plus rendered turns. */
export interface SessionViewAssembly {
  readonly session: SessionView;
  readonly turns: TurnNode[];
}

/**
 * Assemble a complete client view from a wire session and its event window.
 *
 * Pure and synchronous. The caller owns the window (contiguous tail slice)
 * and may pass live overlays; nothing is read from a database.
 *
 * @param view - the session as delivered by the host.
 * @param events - the contiguous event window currently held by the client.
 * @param options - optimistic prompts and in-flight assistant text.
 * @returns the folded wire view and the rendered turn list.
 */
export function assembleSessionView(
  view: SessionView,
  events: readonly SessionEvent[],
  options: AssembleSessionViewOptions = {},
): SessionViewAssembly {
  const prompts = pendingPrompts(events, options.prompts ?? []);
  const durable = foldEventsToTurns(events, {
    sessionId: view.id,
    ...(options.defaultCollapsedCompleted === undefined
      ? {}
      : { defaultCollapsedCompleted: options.defaultCollapsedCompleted }),
  });
  const turns = withAssistantStream(
    withOptimisticPrompts(durable, prompts, view.id),
    options.assistantStream,
  );

  return {
    session: applySessionViewEvents(view, events),
    turns,
  };
}
