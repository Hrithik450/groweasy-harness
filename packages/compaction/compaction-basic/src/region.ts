/**
 * Projection and retention selection over the append-only session log.
 *
 * The log is never rewritten. Checkpoints declare an inclusive shadowed range,
 * and model-free prunes declare replacement tool-result content. This module
 * folds both into the current model-visible surface so derivation, pressure
 * measurement, and range selection agree on one view.
 *
 * @module @openai-harness/compaction-basic/region
 */

import { toolPairingBalances } from "@openai-harness/compaction";
import type { ContentBlock } from "@openai-harness/llm";
import { SessionSeq } from "@openai-harness/session";
import type {
  CompactionCheckpointEventData,
  CompactionTrigger,
  SessionEvent,
} from "@openai-harness/session";

import type { CompactionRange } from "./types";

/** Token overhead charged to every replayed message. */
const MESSAGE_OVERHEAD = 4;

/** A checkpoint marker paired with its surface message, when persisted. */
export interface ResolvedCheckpoint {
  readonly compactionId: string;
  /** Seq of the `compaction/checkpoint` marker. */
  readonly eventSeq: SessionSeq;
  readonly summary: string;
  readonly startSeq: SessionSeq;
  readonly endSeq: SessionSeq;
  readonly shadowedSeqs: readonly SessionSeq[];
  readonly shadowedTokenCount: number;
  readonly trigger: CompactionTrigger;
  /** The checkpoint `user/message`, when the log contains it. */
  readonly messageSeq?: SessionSeq;
  readonly messageContent?: readonly ContentBlock[];
}

/** Current compaction state folded from the durable log. */
export interface CompactionProjection {
  readonly checkpoints: readonly ResolvedCheckpoint[];
  /** Every log position hidden by at least one checkpoint range. */
  readonly shadowedSeqs: ReadonlySet<SessionSeq>;
  /** Checkpoint summaries emitted at their shadowed range's first position. */
  readonly checkpointAtStart: ReadonlyMap<SessionSeq, ResolvedCheckpoint>;
  /**
   * Checkpoints condensed by a later checkpoint. Their markers remain in the
   * log, but neither their summary nor their surface message is replayed.
   */
  readonly supersededCheckpointIds: ReadonlySet<string>;
  /** Replacement content for pruned tool results, keyed by original seq. */
  readonly pruneBySeq: ReadonlyMap<SessionSeq, readonly ContentBlock[]>;
}

/** One model-visible surface entry used for measurement and selection. */
export interface VisibleEntry {
  readonly seq: SessionSeq;
  readonly tokens: number;
  readonly toolCalls: number;
  readonly toolResult: boolean;
  readonly system: boolean;
}

/** Read the checkpoint id carried by a persisted checkpoint user message. */
function checkpointIdOf(event: SessionEvent): string | undefined {
  if (event.type !== "user/message") return undefined;
  const source = event.data.source;
  if (source?.kind !== "compact-checkpoint") return undefined;
  const id = source.compactionId;
  return typeof id === "string" ? id : undefined;
}

/**
 * Fold checkpoint markers, checkpoint messages, and prune replacements into
 * the current model-visible view.
 * @param events - durable session log in seq order.
 * @returns the projection used by derivation, measurement, and selection.
 */
export function projectCompaction(
  events: readonly SessionEvent[],
): CompactionProjection {
  const messageByCheckpoint = new Map<
    string,
    Extract<SessionEvent, { type: "user/message" }>
  >();
  const checkpoints: ResolvedCheckpoint[] = [];
  const pruneBySeq = new Map<SessionSeq, readonly ContentBlock[]>();

  for (const event of events) {
    const checkpointId = checkpointIdOf(event);
    if (checkpointId !== undefined && event.type === "user/message") {
      messageByCheckpoint.set(checkpointId, event);
      continue;
    }
    if (event.type === "compaction/prune") {
      pruneBySeq.set(event.data.originalSeq, event.data.content);
    }
  }

  const shadowedSeqs = new Set<SessionSeq>();
  for (const event of events) {
    if (event.type !== "compaction/checkpoint") continue;
    const data: CompactionCheckpointEventData = event.data;
    const message = messageByCheckpoint.get(data.compactionId);
    checkpoints.push({
      compactionId: data.compactionId,
      eventSeq: event.seq,
      summary: data.summary,
      startSeq: data.shadowedRange.startSeq,
      endSeq: data.shadowedRange.endSeq,
      shadowedSeqs: data.shadowedSeqs,
      shadowedTokenCount: data.shadowedTokenCount,
      trigger: data.trigger,
      ...(message === undefined
        ? {}
        : { messageSeq: message.seq, messageContent: message.data.content }),
    });
    for (
      let seq = Number(data.shadowedRange.startSeq);
      seq <= Number(data.shadowedRange.endSeq);
      seq += 1
    ) {
      shadowedSeqs.add(SessionSeq(seq));
    }
  }

  const supersededCheckpointIds = new Set<string>();
  for (const checkpoint of checkpoints) {
    for (const later of checkpoints) {
      if (Number(later.eventSeq) <= Number(checkpoint.eventSeq)) continue;
      if (
        contains(later, checkpoint.startSeq) ||
        (checkpoint.messageSeq !== undefined &&
          contains(later, checkpoint.messageSeq))
      ) {
        supersededCheckpointIds.add(checkpoint.compactionId);
        break;
      }
    }
  }

  const checkpointAtStart = new Map<SessionSeq, ResolvedCheckpoint>();
  for (const checkpoint of checkpoints) {
    if (checkpoint.messageSeq === undefined) continue;
    if (supersededCheckpointIds.has(checkpoint.compactionId)) continue;
    checkpointAtStart.set(checkpoint.startSeq, checkpoint);
  }

  return {
    checkpoints,
    shadowedSeqs,
    checkpointAtStart,
    supersededCheckpointIds,
    pruneBySeq,
  };
}

/** Whether one checkpoint's inclusive range contains a log position. */
function contains(
  checkpoint: Pick<ResolvedCheckpoint, "startSeq" | "endSeq">,
  seq: SessionSeq,
): boolean {
  return (
    Number(seq) >= Number(checkpoint.startSeq) &&
    Number(seq) <= Number(checkpoint.endSeq)
  );
}

/** Heuristic token cost of one content block. */
function blockTokens(block: ContentBlock): number {
  switch (block.type) {
    case "text":
      return Math.ceil(block.text.length / 4);
    case "tool-call":
      return Math.ceil((block.name.length + block.arguments.length) / 4);
    case "reasoning":
      return 0;
    case "block":
      return Math.ceil(JSON.stringify(block.spec).length / 4);
    case "image":
    case "file":
      return 8;
  }
}

/** Heuristic token cost of one message's content. */
function contentTokens(content: readonly ContentBlock[] | string): number {
  if (typeof content === "string") {
    return content.length === 0 ? 0 : Math.ceil(content.length / 4);
  }
  let tokens = 0;
  for (const block of content) tokens += blockTokens(block);
  return tokens;
}

/**
 * Build the ordered model-visible entries from the log and its projection.
 * Shadowed events are omitted; a checkpoint summary stands at its range start.
 * @param events - durable session log.
 * @param projection - folded compaction state.
 * @returns model-visible entries in surface order.
 */
export function visibleEntries(
  events: readonly SessionEvent[],
  projection: CompactionProjection,
): VisibleEntry[] {
  const entries: VisibleEntry[] = [];

  for (const event of events) {
    if (
      event.type === "compaction/checkpoint" ||
      event.type === "compaction/prune"
    ) {
      continue;
    }
    const checkpoint = projection.checkpointAtStart.get(event.seq);
    if (checkpoint?.messageContent !== undefined) {
      entries.push({
        seq: event.seq,
        tokens:
          contentTokens([...checkpoint.messageContent]) + MESSAGE_OVERHEAD,
        toolCalls: 0,
        toolResult: false,
        system: false,
      });
    }
    if (projection.shadowedSeqs.has(event.seq)) continue;
    if (checkpointIdOf(event) !== undefined) continue;

    switch (event.type) {
      case "user/message": {
        if (event.data.source?.kind === "tool-result") break;
        entries.push({
          seq: event.seq,
          tokens: contentTokens(event.data.content) + MESSAGE_OVERHEAD,
          toolCalls: 0,
          toolResult: false,
          system: false,
        });
        break;
      }
      case "assistant/message": {
        const content = event.data.message.content;
        entries.push({
          seq: event.seq,
          tokens: contentTokens(content) + MESSAGE_OVERHEAD,
          toolCalls: content.filter((block) => block.type === "tool-call")
            .length,
          toolResult: false,
          system: false,
        });
        break;
      }
      case "system/message": {
        entries.push({
          seq: event.seq,
          tokens: contentTokens(event.data.content) + MESSAGE_OVERHEAD,
          toolCalls: 0,
          toolResult: false,
          system: true,
        });
        break;
      }
      case "tool/result": {
        const content =
          projection.pruneBySeq.get(event.seq) ?? event.data.message.content;
        entries.push({
          seq: event.seq,
          tokens: contentTokens(content) + MESSAGE_OVERHEAD,
          toolCalls: 0,
          toolResult: true,
          system: false,
        });
        break;
      }
    }
  }

  return entries;
}

/** Materialize an inclusive log range as seqs. */
function rangeSeqs(start: SessionSeq, end: SessionSeq): SessionSeq[] {
  const seqs: SessionSeq[] = [];
  for (let seq = Number(start); seq <= Number(end); seq += 1) {
    seqs.push(SessionSeq(seq));
  }
  return seqs;
}

/**
 * Select the oldest usable span while retaining a recent token tail.
 *
 * A leading `system/message` is never shadowed, and the cut is moved earlier
 * until no assistant tool call is separated from its result. Returns `null`
 * when no old span can be compacted safely.
 *
 * @param events - durable session log.
 * @param retainTokens - recent tail budget kept verbatim.
 * @returns the inclusive range to summarize, or `null`.
 */
export function selectCompactableRange(
  events: readonly SessionEvent[],
  retainTokens: number,
): CompactionRange | null {
  if (!Number.isSafeInteger(retainTokens) || retainTokens < 0) {
    throw new Error(
      "selectCompactableRange: retainTokens must be non-negative",
    );
  }

  const projection = projectCompaction(events);
  const entries = visibleEntries(events, projection);
  if (entries.length === 0) return null;

  const firstIdx = entries[0]?.system === true ? 1 : 0;
  const balances = toolPairingBalances(entries);

  let accumulated = 0;
  let keepFromIdx = entries.length;
  for (let index = entries.length - 1; index >= firstIdx; index -= 1) {
    accumulated += entries[index]?.tokens ?? 0;
    keepFromIdx = index;
    if (accumulated >= retainTokens) break;
  }

  while (keepFromIdx > firstIdx && balances[keepFromIdx] !== 0) {
    keepFromIdx -= 1;
  }
  if (keepFromIdx <= firstIdx) return null;

  const start = entries[firstIdx];
  const end = entries[keepFromIdx - 1];
  if (start === undefined || end === undefined) return null;
  if (Number(end.seq) < Number(start.seq)) return null;

  return {
    startSeq: start.seq,
    endSeq: end.seq,
    shadowedSeqs: rangeSeqs(start.seq, end.seq),
  };
}

/**
 * The latest provider-reported prompt size at or after the newest checkpoint,
 * or `undefined` before such a usage frame has been recorded.
 *
 * Usage recorded before a checkpoint describes the pre-compaction request;
 * honoring it after the replacement landed would re-trigger compaction against
 * the already-reduced surface. Callers fall back to the character estimate in
 * that case.
 *
 * @param events - durable session log.
 * @returns the newest post-checkpoint `usage.promptTokens`.
 */
export function latestPromptTokens(
  events: readonly SessionEvent[],
): number | undefined {
  let afterSeq = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "compaction/checkpoint") {
      afterSeq = Number(event.seq);
      break;
    }
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined || Number(event.seq) <= afterSeq) break;
    if (event.type !== "assistant/message") continue;
    const usage = event.data.usage ?? event.data.message.usage;
    if (usage !== undefined) return usage.promptTokens;
  }
  return undefined;
}

/**
 * Estimate the current model-visible prompt size in tokens.
 * @param events - durable session log.
 * @param projection - optional pre-folded compaction state.
 * @returns estimated prompt tokens.
 */
export function estimateVisibleTokens(
  events: readonly SessionEvent[],
  projection: CompactionProjection = projectCompaction(events),
): number {
  return visibleEntries(events, projection).reduce(
    (total, entry) => total + entry.tokens,
    0,
  );
}

/**
 * Estimate the token price of one selected range.
 * @param events - durable session log.
 * @param range - selected inclusive range.
 * @param projection - optional pre-folded compaction state.
 * @returns estimated tokens inside the range.
 */
export function estimateRangeTokens(
  events: readonly SessionEvent[],
  range: CompactionRange,
  projection: CompactionProjection = projectCompaction(events),
): number {
  return visibleEntries(events, projection)
    .filter(
      (entry) =>
        Number(entry.seq) >= Number(range.startSeq) &&
        Number(entry.seq) <= Number(range.endSeq),
    )
    .reduce((total, entry) => total + entry.tokens, 0);
}

/**
 * Replay exactly the selected visible span for summarization. The result is a
 * compact event list: shadowed events are omitted, an earlier checkpoint
 * summary stands in at its range start, and prune replacements are included so
 * derivation applies them.
 * @param events - durable session log.
 * @param range - selected inclusive range.
 * @param projection - pre-folded compaction state.
 * @returns events representing the span in surface order.
 */
export function selectRangeEvents(
  events: readonly SessionEvent[],
  range: CompactionRange,
  projection: CompactionProjection,
): SessionEvent[] {
  const selected: SessionEvent[] = [];
  const includedCheckpoints = new Set<string>();

  for (const event of events) {
    if (
      Number(event.seq) < Number(range.startSeq) ||
      Number(event.seq) > Number(range.endSeq)
    ) {
      continue;
    }
    if (
      event.type === "compaction/checkpoint" ||
      event.type === "compaction/prune"
    ) {
      continue;
    }

    const checkpoint = projection.checkpointAtStart.get(event.seq);
    if (checkpoint?.messageSeq !== undefined) {
      const message = events.find(
        (candidate) => candidate.seq === checkpoint.messageSeq,
      );
      if (message !== undefined) {
        selected.push(message);
        includedCheckpoints.add(checkpoint.compactionId);
      }
    }
    if (projection.shadowedSeqs.has(event.seq)) continue;

    const checkpointId = checkpointIdOf(event);
    if (checkpointId !== undefined) {
      if (
        includedCheckpoints.has(checkpointId) ||
        projection.supersededCheckpointIds.has(checkpointId)
      ) {
        continue;
      }
      selected.push(event);
      continue;
    }

    selected.push(event);
  }

  for (const event of events) {
    if (event.type !== "compaction/prune") continue;
    if (
      Number(event.data.originalSeq) < Number(range.startSeq) ||
      Number(event.data.originalSeq) > Number(range.endSeq)
    ) {
      continue;
    }
    selected.push(event);
  }

  return selected;
}
