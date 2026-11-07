/**
 * Ad-delivery uniqueness for one session.
 *
 * "Deliver unique ads only" is a property of the session, not of one tool call:
 * the model searches several scopes per turn and again on later turns, and the
 * scopes overlap. The session's own event log is the durable record of what it
 * already received — every completed `searchAdLibrary` result carries one
 * `Library ID:` line per delivered ad — so the exclusion is derived from that
 * log instead of an in-process set that a gateway restart would drop.
 *
 * The pure functions here keep the selection rule testable without a running
 * session: ids already delivered are never handed out again, and two library
 * ids carrying the same creative (Meta's "N ads use this creative and text")
 * count as one ad.
 *
 * @module @openai-harness/tool-meta/search-ad-library/delivered
 */

import type { SessionEvent } from "@openai-harness/session";
import type { ScoredScrapedAd } from "@openai-harness/scraper";

const LIBRARY_ID_RE = /Library ID:\s*(\d+)/g;

/** Result text of one tool message, flattened from its content blocks. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      block !== null &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text"
        ? String((block as { text?: unknown }).text ?? "")
        : "",
    )
    .join("\n");
}

/** Library ids named in a block of result text. */
function libraryIds(text: string): string[] {
  return Array.from(text.matchAll(LIBRARY_ID_RE), (match) => match[1]!);
}

/**
 * Ad ids this session already delivered.
 *
 * Only successful results of this tool are counted: a failed call delivered no
 * ads, and another tool's output is not an ad delivery even if it quotes an id.
 *
 * @param events - the session's committed event log, oldest first.
 * @returns every `libraryId` the model has already been shown in this session.
 */
export function deliveredAdIds(
  events: readonly SessionEvent[],
): Set<string> {
  const searchCallIds = new Set<string>();
  for (const event of events) {
    if (event.type === "tool/call" && event.data.name === "searchAdLibrary") {
      searchCallIds.add(String(event.data.callId));
    }
  }

  const ids = new Set<string>();
  if (searchCallIds.size === 0) return ids;

  for (const event of events) {
    if (event.type !== "tool/result") continue;
    if (event.data.error !== undefined) continue;
    const message = event.data.message;
    if (!searchCallIds.has(String(message.toolCallId))) continue;
    for (const id of libraryIds(resultText(message.content))) ids.add(id);
  }
  return ids;
}

/**
 * Pick up to `count` ads that were never delivered and are not blocked.
 *
 * The pool is already relevance-ordered, so this keeps its order. Ids in
 * `blocked` are skipped outright; a creative already picked in this pass is
 * skipped once even when Meta lists it under several library ids, which is what
 * makes the delivered set unique ads rather than unique rows.
 *
 * `blockedHashes` carries the creatives of ads already answered in this session
 * (and of those reserved by a selection already in flight). Two cache tiers can
 * return the same creative under different library ids, so the hash exclusion
 * has to cross tiers, not just the pool being picked from.
 *
 * @param pool - relevance-ordered candidate ads.
 * @param blocked - ids already delivered or reserved.
 * @param count - maximum number of ads to return.
 * @param blockedHashes - creative hashes already delivered or reserved.
 * @returns the ads to deliver, in pool order.
 */
export function pickUniqueAds(
  pool: readonly ScoredScrapedAd[],
  blocked: ReadonlySet<string>,
  count: number,
  blockedHashes: ReadonlySet<string> = new Set(),
): ScoredScrapedAd[] {
  const picked: ScoredScrapedAd[] = [];
  const seenHashes = new Set<string>(blockedHashes);

  for (const ad of pool) {
    if (picked.length >= count) break;
    if (blocked.has(ad.libraryId) || seenHashes.has(ad.contentHash)) continue;
    seenHashes.add(ad.contentHash);
    picked.push(ad);
  }

  return picked;
}
