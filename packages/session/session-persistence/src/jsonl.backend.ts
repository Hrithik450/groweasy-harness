/**
 * JSONL implementation of the session persistence seam.
 *
 * The file format, atomic publish, contiguous append, and cross-process lease
 * live in the provider package. This adapter only maps the provider's snapshots
 * onto the domain's storage-neutral records and translates its contiguity
 * failure into the domain's stable error.
 *
 * The provider is imported by relative path because the repository's shared
 * `tsconfig.base.json` is frozen while other agents work in this checkout; the
 * workspace package still declares its canonical name and dependency.
 *
 * @module @openai-harness/session-persistence
 */

import type { SessionEvent } from "@openai-harness/session";
import {
  JsonlSessionContiguityError,
  JsonlSessionPersistence,
  type JsonlSessionPersistenceConfig,
  type JsonlSessionRecord,
  type JsonlSessionSnapshot,
} from "../../session-persistence-jsonl/src/index.ts";
import { SessionContiguityError } from "./contract.ts";
import type {
  PersistedSession,
  PersistedSessionMetadata,
  PersistedSessionMetadataPatch,
  PersistedSessionWithEvents,
  SessionPersistenceBackend,
} from "./backend.ts";

/** Map one provider snapshot onto the domain record. */
function toPersisted(snapshot: JsonlSessionSnapshot): PersistedSession {
  return {
    header: snapshot.header,
    title: snapshot.title,
    slug: snapshot.slug,
    hidden: snapshot.hidden,
    createdAt: snapshot.header.createdAt,
    updatedAt: snapshot.updatedAt,
    eventCount: snapshot.eventCount,
  };
}

/** Map one provider record onto the domain record with events. */
function toPersistedWithEvents(
  record: JsonlSessionRecord,
): PersistedSessionWithEvents {
  return {
    ...toPersisted(record),
    events: record.events,
    nextSeq: record.nextSeq,
  };
}

/** The append-only JSONL session backend. */
export class JsonlSessionPersistenceBackend
  implements SessionPersistenceBackend
{
  private readonly store: JsonlSessionPersistence;

  /**
   * @param input - provider configuration or a pre-built provider (tests).
   */
  constructor(input: JsonlSessionPersistenceConfig | JsonlSessionPersistence) {
    this.store =
      input instanceof JsonlSessionPersistence
        ? input
        : new JsonlSessionPersistence(input);
  }

  async create(
    header: PersistedSession["header"],
    metadata: PersistedSessionMetadata,
  ): Promise<void> {
    await this.store.create(header, {
      title: metadata.title,
      slug: metadata.slug,
      hidden: metadata.hidden,
      updatedAt: metadata.updatedAt,
    });
  }

  async read(id: string): Promise<PersistedSessionWithEvents | undefined> {
    const record = await this.store.read(id);
    return record === undefined ? undefined : toPersistedWithEvents(record);
  }

  async stat(id: string): Promise<PersistedSession | undefined> {
    const snapshot = await this.store.stat(id);
    return snapshot === undefined ? undefined : toPersisted(snapshot);
  }

  async list(): Promise<readonly PersistedSession[]> {
    return (await this.store.list()).map(toPersisted);
  }

  async append(id: string, events: readonly SessionEvent[]): Promise<void> {
    try {
      await this.store.append(id, events);
    } catch (error) {
      if (error instanceof JsonlSessionContiguityError) {
        throw new SessionContiguityError(
          error.sessionId,
          error.expectedSeq,
          error.actualSeq,
          error.index,
        );
      }
      throw error;
    }
  }

  async updateMetadata(
    id: string,
    patch: PersistedSessionMetadataPatch,
  ): Promise<PersistedSession | undefined> {
    const snapshot = await this.store.updateMetadata(id, patch);
    return snapshot === undefined ? undefined : toPersisted(snapshot);
  }

  delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  flush(): Promise<void> {
    return this.store.flush();
  }

  close(): Promise<void> {
    return this.store.close();
  }
}
