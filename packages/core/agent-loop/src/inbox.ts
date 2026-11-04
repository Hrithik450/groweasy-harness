/**
 * Driver-owned durable agent inbox implementation.
 * Manages pending 'next-turn' and 'next-step' messages and durably logs
 * every splice via `agent/inbox/spliced`.
 *
 *
 * @module @openai-harness/agent-loop
 */

import type { MessageId, UserMessage } from "@openai-harness/llm";
import type { AgentSession, Inbox, InboxTarget } from "./agent-types";

export class ReactLoopInbox implements Inbox {
  private _state: {
    "next-turn": UserMessage[];
    "next-step": UserMessage[];
  } = {
    "next-turn": [],
    "next-step": [],
  };

  constructor(private readonly session: AgentSession) {
    for (const event of session.events) {
      if (event.type === "agent/inbox/spliced") {
        const splice = event.data;
        const targetList = this._state[splice.target];
        const removedCount = splice.removedCount ?? 0;
        targetList.splice(
          splice.start,
          removedCount,
          ...(splice.inserted || []),
        );
      }
    }
  }

  get nextTurn(): readonly UserMessage[] {
    return this._state["next-turn"];
  }

  get nextStep(): readonly UserMessage[] {
    return this._state["next-step"];
  }

  get hasPending(): boolean {
    return (
      this._state["next-turn"].length > 0 || this._state["next-step"].length > 0
    );
  }

  clear(): void {
    if (this._state["next-step"].length > 0) {
      this.splice("next-step", 0, this._state["next-step"].length, []);
    }
    if (this._state["next-turn"].length > 0) {
      this.splice("next-turn", 0, this._state["next-turn"].length, []);
    }
  }

  append(target: InboxTarget, message: UserMessage): void {
    this.splice(target, this._state[target].length, 0, [message]);
  }

  prepend(target: InboxTarget, message: UserMessage): void {
    this.splice(target, 0, 0, [message]);
  }

  replace(messageId: MessageId | string, newMessage: UserMessage): boolean {
    const target = this._state["next-step"].some((m) => m.id === messageId)
      ? "next-step"
      : this._state["next-turn"].some((m) => m.id === messageId)
        ? "next-turn"
        : null;

    if (!target) return false;
    const index = this._state[target].findIndex((m) => m.id === messageId);
    if (index === -1) return false;

    this.splice(target, index, 1, [newMessage]);
    return true;
  }

  remove(messageId: MessageId | string): boolean {
    const target = this._state["next-step"].some((m) => m.id === messageId)
      ? "next-step"
      : this._state["next-turn"].some((m) => m.id === messageId)
        ? "next-turn"
        : null;

    if (!target) return false;
    const index = this._state[target].findIndex((m) => m.id === messageId);
    if (index === -1) return false;

    this.splice(target, index, 1, []);
    return true;
  }

  splice(
    target: InboxTarget,
    start: number,
    deleteCount: number,
    inserted: UserMessage[],
  ): UserMessage[] {
    const list = this._state[target];
    const removed = list.splice(start, deleteCount, ...inserted);

    this.session.append("agent/inbox/spliced", {
      target,
      start,
      removedCount: deleteCount,
      inserted,
    });

    return removed;
  }

  claim(target: InboxTarget, _turn: number): UserMessage[] {
    const claimed: UserMessage[] = [];

    if (this._state["next-step"].length > 0) {
      claimed.push(
        ...this.splice("next-step", 0, this._state["next-step"].length, []),
      );
    }

    if (target === "next-turn" && this._state["next-turn"].length > 0) {
      claimed.push(...this.splice("next-turn", 0, 1, []));
    }

    return claimed;
  }
}
