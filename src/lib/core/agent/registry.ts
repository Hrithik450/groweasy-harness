import { Session } from "@/lib/core/session/session";
import {
  danglingToolResultClosers,
  interruptedTurnClosers,
} from "@/lib/core/session/repair";
import { ReactLoopAgent } from "@/lib/core/agent/loop/agent";
import type { UserMessage } from "@/lib/llm/llm/message";
import { readSessionLog } from "@/lib/session/log.cache";
import { SESSION_JOURNAL_EVENT } from "@/lib/session/journal";
import { publish, subscribe } from "@/lib/session/bus";
import { sessionKey } from "@/lib/session/keys";
import { projectEventForClient } from "@/lib/session/wire";
import type { ModelToolSchema } from "@/lib/llm/llm/driver";
import type { SessionHeader } from "@/lib/core/session/types";
import type { SessionEvent } from "@/lib/core/session/events";

/** Agents kept warm; each one holds a whole session log. */
const MAX_AGENTS = 16;

type SessionEventListener = (event: SessionEvent) => void;

interface Entry {
  agent: ReactLoopAgent<Session>;
}

const globalForAgents = globalThis as unknown as {
  __sessionAgents?: Map<string, Entry>;
};

/** Insertion order doubles as LRU order: refreshed on use, oldest evicted. */
const entries = (globalForAgents.__sessionAgents ??= new Map<string, Entry>());

/**
 * What the host must supply to create an agent.
 *
 * The registry knows a session by its header and a turn by its composition;
 * it never reads a storage row.
 */
export interface AgentSeed {
  header: SessionHeader;
  /** Single source of the system prompt, resolved for each model step. */
  resolveInstructions: () => string;
  tools: readonly ModelToolSchema[];
}

/** Drop the least recently used agent that is not mid-turn. */
function evictOverflow(): void {
  while (entries.size > MAX_AGENTS) {
    let victim: string | undefined;
    for (const [id, entry] of entries) {
      if (entry.agent.status !== "running") {
        victim = id;
        break;
      }
    }
    if (victim === undefined) return;
    entries.delete(victim);
  }
}

function touch(sessionId: string, entry: Entry): Entry {
  entries.delete(sessionId);
  entries.set(sessionId, entry);
  return entry;
}

/**
 * Return the warm agent for a session, creating it from the durable log on a
 * miss. Composition is fixed at creation, exactly as the host supplied it.
 */
/** Is an agent already warm for this session? */
export function hasAgent(sessionId: string): boolean {
  return entries.has(sessionId);
}

export async function ensureAgent(
  seed: AgentSeed,
): Promise<ReactLoopAgent<Session>> {
  const sessionId = String(seed.header.id);
  const existing = entries.get(sessionId);
  if (existing) return touch(sessionId, existing).agent;

  const session = await Session.load(
    seed.header,
    await readSessionLog(sessionId),
  );
  // `Session.load` already repaired an interrupted tail; live turns are
  // re-balanced before a prompt and after a cancel.
  const { resolveInstructions, tools } = seed;

  const agent = new ReactLoopAgent(
    session,
    {},
    {
      instructions: resolveInstructions,
      tools: [...tools],
      onStreamFrame: (frame) =>
        publish(sessionKey(sessionId), {
          event: SESSION_JOURNAL_EVENT,
          data: { type: "assistant-stream", frame },
        }),
    },
  );

  session.onEvent((event) => {
    const projected = projectEventForClient(event);
    if (!projected) return;
    publish(sessionKey(sessionId), {
      event: SESSION_JOURNAL_EVENT,
      data: { type: "append", entry: projected },
    });
  });

  entries.set(sessionId, { agent });
  evictOverflow();
  return agent;
}

/** Durable session events only; frames and bar snapshots are separate events. */
export function subscribeEvents(
  sessionId: string,
  listener: SessionEventListener,
): () => void {
  return subscribe(sessionKey(sessionId), (message) => {
    if (message.event !== SESSION_JOURNAL_EVENT) return;
    const data = message.data as { type?: string; entry?: SessionEvent };
    if (data.type === "append" && data.entry) listener(data.entry);
  });
}

/**
 * Append the synthetic closers an interrupted tail needs.
 *
 * Only safe while the agent is idle: closing a call that is still running
 * would duplicate its result once the tool finishes.
 */
function closeInterruptedTail(session: Session): void {
  const closers = [
    ...interruptedTurnClosers(session.events),
    ...danglingToolResultClosers(session.events),
  ];
  for (const closer of closers) {
    switch (closer.type) {
      case "tool/result":
        session.append("tool/result", closer.data);
        break;
      case "step/end":
        session.append("step/end", closer.data);
        break;
      case "turn/end":
        session.append("turn/end", closer.data);
        break;
      default:
        break;
    }
  }
}

/** Whether the session's agent is mid-turn. */
export function isAgentRunning(sessionId: string): boolean {
  return entries.get(sessionId)?.agent.status === "running";
}

export function enqueuePrompt(
  sessionId: string,
  messages: readonly UserMessage[],
  mode: "queue" | "steer",
): boolean {
  const entry = entries.get(sessionId);
  if (!entry) return false;
  touch(sessionId, entry);
  // A cancelled turn can leave an unanswered tool call; a new model request
  // built on it is rejected, so close the tail before queueing.
  if (entry.agent.status === "idle") {
    closeInterruptedTail(entry.agent.session);
  }
  for (const message of messages) {
    if (mode === "steer") entry.agent.steer(message);
    else entry.agent.followup(message);
  }
  return true;
}

/** Resolve once the agent settles; used by schedulers that record completion. */
export async function whenAgentIdle(sessionId: string): Promise<void> {
  const entry = entries.get(sessionId);
  if (!entry) return;
  await entry.agent.whenIdle();
}

/** Interrupt the agent's turn and clear its inbox. */
export function cancelAgent(sessionId: string): boolean {
  const entry = entries.get(sessionId);
  if (!entry) return false;
  entry.agent.cancel({ kind: "user" }, { keepInbox: false });
  // Once the turn settles, balance the log: a tool call cancelled mid-flight
  // has no result, and the next model request would be rejected with it.
  void entry.agent.whenIdle().then(() => {
    closeInterruptedTail(entry.agent.session);
  });
  return true;
}

/** Forget the agent; the next prompt rebuilds it from the durable log. */
export function disposeAgent(sessionId: string): void {
  entries.delete(sessionId);
}
