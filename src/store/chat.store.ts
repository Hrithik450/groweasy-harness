"use client";

import { create } from "zustand";
import type { SessionEvent } from "@/lib/core/session/events";
import type { AssistantStreamFrame } from "@/lib/core/agent/loop/types";
import type { LiveAssistantStream } from "./derive.nodes";

export interface SessionPagination {
  hasMore: boolean;
  isLoadingOlder: boolean;
  isLoadingInitial: boolean;
  cursor: string | null;
}

function bySeq(left: SessionEvent, right: SessionEvent): number {
  return left.seq - right.seq;
}

/** A prompt sent by this tab that the log has not acknowledged yet. */
export interface PendingPrompt {
  /** Human text parts; attachment-only prompts render no bubble. */
  text: string;
  /** Client-minted id, persisted as the message's `source.rpcId`. */
  requestId: string;
  createdAt: number;
}

/** A queued prompt that never lands is dropped after twelve minutes. */
const PENDING_TTL_MS = 12 * 60_000;

/** The `rpcId`s carried by committed user messages in one journal slice. */
function acknowledgedIds(entries: readonly SessionEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "user/message") continue;
    const source = entry.data.source as { rpcId?: unknown } | undefined;
    if (typeof source?.rpcId === "string") ids.add(source.rpcId);
  }
  return ids;
}

/** Drop acknowledged and expired prompts; returns the same array if unchanged. */
function reconcilePending(
  current: readonly PendingPrompt[] | undefined,
  acknowledged: ReadonlySet<string>,
  now: number,
): readonly PendingPrompt[] | undefined {
  if (current === undefined) return undefined;
  const kept = current.filter(
    (prompt) =>
      !acknowledged.has(prompt.requestId) &&
      now - prompt.createdAt < PENDING_TTL_MS,
  );
  return kept.length === current.length ? current : kept;
}

/** Replace or clear one session's pending list. */
function withPending(
  all: Record<string, PendingPrompt[]>,
  sessionId: string,
  next: readonly PendingPrompt[] | undefined,
): Record<string, PendingPrompt[]> {
  if (next === undefined || next.length === 0) {
    if (!(sessionId in all)) return all;
    const copy = { ...all };
    delete copy[sessionId];
    return copy;
  }
  if (all[sessionId] === next) return all;
  return { ...all, [sessionId]: [...next] };
}

export interface ChatStoreState {
  events: Record<string, SessionEvent[]>;
  pagination: Record<string, SessionPagination>;
  liveStreams: Record<string, LiveAssistantStream | undefined>;
  /** Prompts sent by this tab, awaiting their durable user message. */
  pending: Record<string, PendingPrompt[]>;

  addPending: (sessionId: string, prompt: PendingPrompt) => void;
  removePending: (sessionId: string, requestId: string) => void;
  clearPending: (sessionId: string) => void;

  setPagination: (
    sessionId: string,
    pagination: Partial<SessionPagination>,
  ) => void;

  // Journal reducers
  replaceJournal: (
    sessionId: string,
    entries: readonly SessionEvent[],
    cursor: string | null,
    hasMore: boolean,
  ) => void;
  prependJournal: (
    sessionId: string,
    entries: readonly SessionEvent[],
    cursor: string | null,
    hasMore: boolean,
  ) => void;
  appendJournal: (sessionId: string, entry: SessionEvent) => void;

  // Live preview
  applyAssistantFrame: (sessionId: string, frame: AssistantStreamFrame) => void;
  endStreaming: (sessionId: string) => void;
}

export const useChatStore = create<ChatStoreState>((set) => ({
  events: {},
  pagination: {},
  liveStreams: {},
  pending: {},

  addPending: (sessionId, prompt) =>
    set((state) => {
      const current = state.pending[sessionId] ?? [];
      if (current.some((entry) => entry.requestId === prompt.requestId)) {
        return state;
      }
      return {
        pending: { ...state.pending, [sessionId]: [...current, prompt] },
      };
    }),

  removePending: (sessionId, requestId) =>
    set((state) => {
      const current = state.pending[sessionId];
      if (current === undefined) return state;
      const next = current.filter((entry) => entry.requestId !== requestId);
      return { pending: withPending(state.pending, sessionId, next) };
    }),

  clearPending: (sessionId) =>
    set((state) => ({
      pending: withPending(state.pending, sessionId, undefined),
    })),

  setPagination: (sessionId, pagination) =>
    set((state) => {
      const current = state.pagination[sessionId] || {
        cursor: null,
        hasMore: false,
        isLoadingInitial: false,
        isLoadingOlder: false,
      };
      return {
        pagination: {
          ...state.pagination,
          [sessionId]: { ...current, ...pagination },
        },
      };
    }),

  replaceJournal: (sessionId, entries, cursor, hasMore) =>
    set((state) => {
      const nextPending = reconcilePending(
        state.pending[sessionId],
        acknowledgedIds(entries),
        Date.now(),
      );
      return {
        events: { ...state.events, [sessionId]: [...entries].sort(bySeq) },
        pending: withPending(state.pending, sessionId, nextPending),
        pagination: {
          ...state.pagination,
          [sessionId]: {
            cursor,
            hasMore,
            isLoadingInitial: false,
            isLoadingOlder: false,
          },
        },
      };
    }),

  prependJournal: (sessionId, entries, cursor, hasMore) =>
    set((state) => {
      const current = state.events[sessionId] ?? [];
      const first = current[0]?.seq;
      const older = entries.filter(
        (entry) => first === undefined || entry.seq < first,
      );
      const nextPending = reconcilePending(
        state.pending[sessionId],
        acknowledgedIds(entries),
        Date.now(),
      );
      return {
        events: {
          ...state.events,
          [sessionId]: [...older, ...current].sort(bySeq),
        },
        pending: withPending(state.pending, sessionId, nextPending),
        pagination: {
          ...state.pagination,
          [sessionId]: {
            cursor,
            hasMore,
            isLoadingInitial: false,
            isLoadingOlder: false,
          },
        },
      };
    }),

  appendJournal: (sessionId, entry) =>
    set((state) => {
      const current = state.events[sessionId] ?? [];
      const last = current[current.length - 1]?.seq;
      if (last !== undefined && entry.seq <= last) return {};

      let live = state.liveStreams[sessionId];
      if (
        live &&
        (entry.type === "assistant/message" ||
          entry.type === "assistant/attempt") &&
        entry.seq >= live.startedAfterSeq
      ) {
        live = undefined;
      }

      const liveStreams = { ...state.liveStreams };
      if (live) liveStreams[sessionId] = live;
      else delete liveStreams[sessionId];

      const nextPending = reconcilePending(
        state.pending[sessionId],
        acknowledgedIds([entry]),
        Date.now(),
      );

      return {
        liveStreams,
        events: { ...state.events, [sessionId]: [...current, entry] },
        pending: withPending(state.pending, sessionId, nextPending),
      };
    }),

  endStreaming: (sessionId) =>
    set((state) => {
      const liveStreams = { ...state.liveStreams };
      delete liveStreams[sessionId];
      return { liveStreams };
    }),

  applyAssistantFrame: (sessionId, frame) =>
    set((state) => {
      const current = state.liveStreams[sessionId];
      let live = current;

      if (frame.type === "start") {
        live = {
          attemptId: frame.attemptId,
          turn: frame.turn,
          step: frame.step,
          startedAfterSeq: frame.startedAfterSeq,
          text: "",
        };
      } else if (frame.type === "chunk") {
        if (!current || current.attemptId !== frame.attemptId) return {};
        live = {
          ...current,
          text: frame.text ?? current.text + (frame.delta ?? ""),
        };
      } else {
        if (!current || current.attemptId !== frame.attemptId) return {};
        live = undefined;
      }

      const liveStreams = { ...state.liveStreams };
      if (live) liveStreams[sessionId] = live;
      else delete liveStreams[sessionId];
      return { liveStreams };
    }),
}));
