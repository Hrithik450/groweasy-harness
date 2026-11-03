/**
 * Session persistence: the storage seam, the append-only event ledger, the
 * session record domain, and the derived projection cache.
 *
 * The source of truth is an append-only JSONL log owned by
 * `@openai-harness/session-persistence-jsonl`. This package owns the
 * storage-neutral seams and the query/view/service semantics; it imports no
 * SQL client and no schema.
 *
 * @module @openai-harness/session-persistence
 */

export * from "./backend";
export * from "./jsonl.backend";
export * from "./contract";
export * from "./events.repo";
export * from "./store";
export * from "./session.store";
export * from "./view.contracts";
export * from "./types";
export * from "./view";
export * from "./projection.cache";
export * from "./detail.bar.repo";
export * from "./service";
export { SessionsRepository, sessionsRepo } from "./repository";
