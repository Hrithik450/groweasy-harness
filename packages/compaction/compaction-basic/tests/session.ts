import type { CompactionSession } from "@openai-harness/compaction";
import { SessionSeq } from "@openai-harness/session";
import type {
  SessionEvent,
  SessionEventMap,
  SessionEventType,
} from "@openai-harness/session";

/** In-memory CompactionSession stub with no persistence or database. */
export class TestSession implements CompactionSession {
  private readonly log: SessionEvent[] = [];

  constructor(readonly userId?: string) {}

  get events(): readonly SessionEvent[] {
    return this.log;
  }

  append<K extends SessionEventType>(
    type: K,
    data: SessionEventMap[K],
    opts?: {
      surfaceOp?: "append" | "replace";
      sourceEventSeqs?: SessionSeq[];
    },
  ): SessionEvent<K> {
    const event = {
      type,
      seq: SessionSeq(this.log.length),
      time: Date.now(),
      data,
      ...opts,
    } as SessionEvent<K>;
    this.log.push(event as unknown as SessionEvent);
    return event;
  }
}
