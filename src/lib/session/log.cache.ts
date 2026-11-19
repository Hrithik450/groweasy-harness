/**
 * Hot session logs, held in this process only.
 *
 * A session's log is read on every prompt, dedupe, and projection read. Keeping
 * the most recent ones in memory makes those reads free after the first, which
 * is the one thing the reference harness gets from its live agent registry.
 *
 * Single-instance assumption: an append through `Session` updates the cache in
 * place, so no cross-process invalidation is needed. Anything written outside
 * `Session` must call {@link rememberSessionLog} or {@link forgetSessionLog}.
 *
 * @module @/lib/session/log.cache
 */

import type { SessionEvent } from "@/lib/core/session/events";
import { sessionEventsRepo } from "./persistence/events.repo";

/** Sessions kept hot; each entry is one whole log. */
const MAX_SESSIONS = 16;

/** Logs larger than this are served but never cached: memory stays bounded. */
const MAX_EVENTS_PER_SESSION = 20_000;

const globalForLogs = globalThis as unknown as {
  __sessionLogs?: Map<string, readonly SessionEvent[]>;
};

/** Insertion order doubles as LRU order: oldest first, refreshed on read. */
const logs = (globalForLogs.__sessionLogs ??= new Map<
  string,
  readonly SessionEvent[]
>());

/** Read the session's log from the cache, loading and caching it on a miss. */
export async function readSessionLog(
  sessionId: string,
): Promise<readonly SessionEvent[]> {
  const cached = logs.get(sessionId);
  if (cached !== undefined) {
    logs.delete(sessionId);
    logs.set(sessionId, cached);
    return cached;
  }

  const events = await sessionEventsRepo.getEvents(sessionId);
  rememberSessionLog(sessionId, events);
  return events;
}

/** Store a complete log for a session, evicting the least recently used one. */
export function rememberSessionLog(
  sessionId: string,
  events: readonly SessionEvent[],
): void {
  if (events.length > MAX_EVENTS_PER_SESSION) {
    logs.delete(sessionId);
    return;
  }

  logs.set(sessionId, events);
  while (logs.size > MAX_SESSIONS) {
    const oldest = logs.keys().next().value;
    if (oldest === undefined) break;
    logs.delete(oldest);
  }
}

/**
 * Add one appended event to a hot log.
 *
 * The event is only spliced in when it continues the cached log exactly; a gap
 * means the cache missed a write, so it is dropped rather than served wrong.
 */
export function appendToSessionLog(
  sessionId: string,
  event: SessionEvent,
): void {
  const cached = logs.get(sessionId);
  if (cached === undefined) return;

  const last = cached[cached.length - 1];
  if (last !== undefined && last.seq + 1 !== event.seq) {
    logs.delete(sessionId);
    return;
  }

  logs.set(sessionId, [...cached, event]);
}

/** Drop a session's cached log; the next read reloads from storage. */
export function forgetSessionLog(sessionId: string): void {
  logs.delete(sessionId);
}
