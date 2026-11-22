/**
 * Barrel for the durable session core: identities, events, projections, and
 * interrupted-turn repair helpers.
 *
 * The stateful {@link Session} class is intentionally not re-exported here so
 * that persistence modules can import this barrel without creating a runtime
 * cycle back through `session.ts`.
 *
 * @module @/lib/core/session
 */

export * from "./types";
export * from "./events";
export * from "./repair";
