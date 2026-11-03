/**
 * Projection type table and pure unit contract.
 *
 * The table is merge-extensible: domain packages augment
 * {@link SessionProjectionMap} with the client-visible keys they own. A unit
 * is a synchronous fold from the committed event log to one key's state.
 *
 * @module @openai-harness/session-projection/projections/types
 */

import type { ZodType } from "zod";
import type {
  SessionEvent,
  SessionHeader,
  SessionSeqCursor,
} from "@openai-harness/session";

/**
 * Merge-extensible map of client-visible projections.
 * Domain packages/tools merge their keys here.
 */
export interface SessionProjectionMap {
  detailBar: {
    type: string;
    data: unknown;
  };
}

/**
 * Pure projection unit contract.
 */
export interface ProjectionDefinition<
  K extends keyof SessionProjectionMap,
  S = SessionProjectionMap[K],
> {
  /** The unique key owned by this projection */
  key: K;
  /** Schema version guard (bumped whenever state fields change) */
  stateVersion: number;
  /** Validates state before it is restored or persisted */
  stateSchema?: ZodType<S>;
  /** Initial state for a fresh session */
  init(header: SessionHeader): S;
  /**
   * Pure synchronous fold: previous state + one committed event -> next state.
   * MUST return the exact same reference (Object.is) if event is irrelevant.
   */
  apply(state: S, event: SessionEvent): S;
}

/** One folded projection value and the log cut it reflects. */
export interface ProjectionSnapshot<
  K extends keyof SessionProjectionMap = keyof SessionProjectionMap,
> {
  key: K;
  asOfSeq: SessionSeqCursor;
  stateVersion: number;
  state: SessionProjectionMap[K];
}
