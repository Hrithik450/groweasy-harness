/**
 * In-memory registry and fold driver for projection units.
 *
 * The registry owns no subscription: hosts push committed events through
 * {@link SessionProjectionRegistry.compute}, optionally seeded by a persisted
 * checkpoint. Storage and the live drive stay host-side.
 *
 * @module @openai-harness/session-projection/projections/registry
 */

import type {
  SessionEvent,
  SessionHeader,
  SessionSeqCursor,
} from "@openai-harness/session";
import type {
  ProjectionDefinition,
  ProjectionSnapshot,
  SessionProjectionMap,
} from "./types";

/** Registry of pure projection units keyed by their client-visible key. */
export class SessionProjectionRegistry {
  private readonly definitions = new Map<
    string,
    ProjectionDefinition<any, any>
  >();

  register<K extends keyof SessionProjectionMap>(
    def: ProjectionDefinition<K, any>,
  ): void {
    this.definitions.set(def.key, def);
  }

  getDefinition<K extends keyof SessionProjectionMap>(
    key: K,
  ): ProjectionDefinition<K, any> | undefined {
    return this.definitions.get(key);
  }

  /**
   * Computes a fresh projection snapshot over the given events.
   * If a cached checkpoint is provided, only folds events with seq > checkpoint.asOfSeq!
   */
  compute<K extends keyof SessionProjectionMap>(
    key: K,
    header: SessionHeader,
    events: readonly SessionEvent[],
    checkpoint?: {
      stateVersion: number;
      asOfSeq: number;
      state: unknown;
    },
  ): ProjectionSnapshot<K> {
    const def = this.definitions.get(key) as ProjectionDefinition<K, any>;
    if (!def) {
      throw new Error(`No projection definition registered for key "${key}"`);
    }

    let state: any;
    let startSeq: number;

    if (checkpoint && checkpoint.stateVersion === def.stateVersion) {
      state = checkpoint.state;
      startSeq = checkpoint.asOfSeq;
    } else {
      state = def.init(header);
      startSeq = -1;
    }

    let lastSeq: SessionSeqCursor = startSeq as SessionSeqCursor;

    for (const event of events) {
      if (event.seq > startSeq) {
        state = def.apply(state, event);
        lastSeq = event.seq;
      }
    }

    return {
      key,
      asOfSeq: lastSeq,
      stateVersion: def.stateVersion,
      state,
    };
  }
}

/** Process-wide registry used by the application. */
export const sessionProjectionRegistry = new SessionProjectionRegistry();
