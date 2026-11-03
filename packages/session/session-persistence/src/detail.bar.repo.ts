/**
 * Whole-value detail-bar writer and reader.
 *
 * This is the only path that appends `detailBar/update` and the only path
 * that advances the `detailBar` checkpoint. Tools, the session RPC command,
 * and the cron workflow all go through it, so the durable log, the derived
 * cache, and every reader observe one stream.
 *
 * Reads fold the checkpoint plus the log tail; the checkpoint is a shortcut,
 * never an authority. Writes serialize per session so a read-modify-write
 * cannot interleave with another writer in this process.
 *
 * @module @openai-harness/session-persistence/detail.bar
 */

import {
  getLiveSession,
  SessionSeq,
  type SessionEvent,
} from "@openai-harness/session";
import {
  DETAIL_BAR_STATE_VERSION,
  detailBarStateSchema,
  emptyDetailBarState,
  foldDetailBarEvents,
  type DetailBarState,
} from "@openai-harness/session-projection";
import { sessionEventsRepo } from "./events.repo";
import { sessionProjectionsRepo } from "./projection.cache";

/** Projection key owned by this module. */
export const DETAIL_BAR_KEY = "detailBar";

/** One detail-bar read: whole state plus the log cut it reflects. */
export interface DetailBarRead {
  state: DetailBarState;
  /** Inclusive watermark of the last folded event; `-1` before any event. */
  asOfSeq: number;
  stateVersion: number;
}

/** Per-session write queues so read-modify-write is atomic in-process. */
const writeQueues = new Map<string, Promise<unknown>>();

function serialize<T>(sessionId: string, job: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(sessionId) ?? Promise.resolve();
  const run = previous.then(job, job);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  writeQueues.set(sessionId, settled);
  void settled.then(() => {
    if (writeQueues.get(sessionId) === settled) writeQueues.delete(sessionId);
  });
  return run;
}

/**
 * Read the current whole detail-bar state.
 *
 * A checkpoint at the current state version seeds the fold; otherwise the
 * fold starts from empty state. In both cases only events after the checkpoint
 * watermark are read and folded.
 *
 * @param sessionId - owning session.
 * @param fallbackType - bar type used when no state has been written yet.
 */
export async function readDetailBarState(
  sessionId: string,
  fallbackType: string,
): Promise<DetailBarRead> {
  const checkpoint = await sessionProjectionsRepo.getCheckpoint<unknown>(
    sessionId,
    DETAIL_BAR_KEY,
  );
  let base = emptyDetailBarState(fallbackType);
  let fromSeq = 0;
  let watermark = -1;
  if (checkpoint?.stateVersion === DETAIL_BAR_STATE_VERSION) {
    const parsed = detailBarStateSchema.safeParse(checkpoint.state);
    if (parsed.success) {
      base = parsed.data;
      fromSeq = checkpoint.asOfSeq + 1;
      watermark = checkpoint.asOfSeq;
    }
  }
  const events = await sessionEventsRepo.getEvents(sessionId, { fromSeq });
  const state = foldDetailBarEvents(base, events);
  const lastSeq = events.at(-1)?.seq;
  if (lastSeq !== undefined) watermark = Number(lastSeq);
  return {
    state,
    asOfSeq: watermark,
    stateVersion: DETAIL_BAR_STATE_VERSION,
  };
}

/**
 * Commit one `detailBar/update` and return its sequence number.
 *
 * When a turn is running on this session, its in-memory session owns
 * the log: it assigns sequence numbers, so appending to the ledger directly
 * would stamp a stale `seq` that the next append of that turn then collides
 * with (the crash this replaces). Appending through the live session keeps one
 * writer per log and still publishes the event to followers. With no turn
 * running there is no live writer and the ledger read-and-append is safe,
 * because every direct writer goes through this file's per-session queue.
 *
 * @param sessionId - owning session.
 * @param next - the complete post-change state.
 */
async function appendDetailBarUpdate(
  sessionId: string,
  next: DetailBarState,
): Promise<number> {
  const live = getLiveSession(sessionId);
  if (live !== undefined) {
    const event = live.append("detailBar/update", { detailBar: next });
    await live.whenPersisted?.();
    return Number(event.seq);
  }

  const seq = await sessionEventsRepo.getNextSeq(sessionId);
  const event = {
    type: "detailBar/update",
    seq: SessionSeq(seq),
    time: Date.now(),
    data: { detailBar: next },
  } as SessionEvent<"detailBar/update">;
  await sessionEventsRepo.append(sessionId, event);
  return seq;
}

/**
 * Atomically read, transform, and append the whole next detail-bar state.
 *
 * The mutator returns the complete post-change state (whole-value rule) or
 * `undefined` to skip the write. The appended event and the advanced
 * checkpoint commit together from the reader's point of view: the next read
 * starts at the appended watermark.
 *
 * @param sessionId - owning session.
 * @param fallbackType - bar type used when no state has been written yet.
 * @param mutate - pure next-state function over the current state.
 * @returns the written state, or `undefined` when the mutator declined.
 */
export function mutateDetailBarState(
  sessionId: string,
  fallbackType: string,
  mutate: (current: DetailBarState) => DetailBarState | undefined,
): Promise<DetailBarState | undefined> {
  return serialize(sessionId, async () => {
    const { state: current } = await readDetailBarState(sessionId, fallbackType);
    const proposed = mutate(current);
    if (proposed === undefined) return undefined;

    const next = detailBarStateSchema.parse(proposed);
    const seq = await appendDetailBarUpdate(sessionId, next);
    await sessionProjectionsRepo.saveCheckpoint(sessionId, DETAIL_BAR_KEY, {
      stateVersion: DETAIL_BAR_STATE_VERSION,
      asOfSeq: seq,
      state: next,
    });
    return next;
  });
}

/**
 * Replace the whole detail-bar state in one append.
 * @param sessionId - owning session.
 * @param next - the complete post-change state.
 */
export function replaceDetailBarState(
  sessionId: string,
  next: DetailBarState,
): Promise<DetailBarState | undefined> {
  return mutateDetailBarState(sessionId, next.type, () => next);
}
