/**
 * Regression test for the thinking row's visibility rule.
 *
 * Renders the real ConversationView through static server rendering with an
 * injected journal binding and slot renderer, so the rule is exercised without
 * a DOM harness or a running stream.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionEvent } from "@openai-harness/session";
import { SessionSeq } from "@openai-harness/session";
import { MessageId } from "@openai-harness/llm";
import {
  configureClientSession,
  resetClientSession,
  type SessionAssistantStreamLike,
  type SessionControllerSnapshotLike,
  type SessionJournalBindingLike,
} from "@openai-harness/client-ui-session";
import { ConversationView } from "../src/client/ConversationView";

const sessionId = "session-1";

function event<E extends SessionEvent["type"]>(
  type: E,
  seq: number,
  data: Extract<SessionEvent, { type: E }>["data"],
): SessionEvent {
  return { type, seq: SessionSeq(seq), time: 0, data } as SessionEvent;
}

/** A running turn that already committed an interim assistant message. */
function runningTurnEvents(): SessionEvent[] {
  return [
    event("turn/start", 0, { turn: 1 }),
    event("user/message", 1, {
      id: MessageId("user-1"),
      role: "user",
      content: [{ type: "text", text: "Inspect the video" }],
      source: { kind: "user" },
    }),
    event("assistant/message", 2, {
      turn: 1,
      step: 1,
      message: {
        id: MessageId("assistant-1"),
        role: "assistant",
        content: [
          {
            type: "text",
            text: "You're right—I can inspect the video. I'll check it now.",
          },
        ],
      },
    }),
  ];
}

function binding(
  assistantStream?: SessionAssistantStreamLike,
): SessionJournalBindingLike {
  const snapshot: SessionControllerSnapshotLike = {
    sessionId,
    status: "open",
    window: {
      events: runningTurnEvents(),
      hasMore: false,
      revision: 3,
    },
    baseSeq: 0,
    loadingOlder: false,
    ...(assistantStream !== undefined ? { assistantStream } : {}),
  };

  return {
    snapshot,
    controller: {
      sessionId,
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      open: () => {},
      close: () => {},
      loadOlder: async () => {},
    },
  };
}

/** Render the view and return the slot keys it dispatched. */
function renderedSlots(stream?: SessionAssistantStreamLike): string[] {
  const keys: string[] = [];
  const renderSlot = ((
    key: string,
    _owner: object,
    _opts?: { fallback?: ReactNode },
  ): ReactNode => {
    keys.push(key);
    return null;
  }) as never;

  configureClientSession({ useSessionJournal: () => binding(stream) });
  try {
    renderToStaticMarkup(
      createElement(ConversationView, {
        config: { sessionId },
        renderSlot,
      } as never),
    );
  } finally {
    resetClientSession();
  }
  return keys;
}

test("keeps the thinking row while a running turn has committed answer text", () => {
  assert.ok(renderedSlots().includes("conversation.thinking"));
});

test("hides the thinking row while live answer text is streaming", () => {
  const keys = renderedSlots({
    attemptId: "attempt-1",
    turn: 1,
    step: 2,
    text: "Checking the video now",
  });
  assert.ok(!keys.includes("conversation.thinking"));
});

test("shows the thinking row when the open step has not emitted text", () => {
  const keys = renderedSlots({
    attemptId: "attempt-1",
    turn: 1,
    step: 2,
    text: "",
  });
  assert.ok(keys.includes("conversation.thinking"));
});
