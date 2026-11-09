/**
 * Browser client for the Session controller.
 *
 * This entry is framework-free except for {@link useSessionJournal}: it owns
 * the follow-stream subscription over `@openai-harness/client-rpc`, the
 * contiguous event-window assembly, the resume cursor, and the React binding
 * the application injects through `configureClientSession`.
 *
 * The host half of this package stays in `src/index.ts`; this module imports
 * no Cordis service and reads no application configuration or environment at
 * module scope.
 *
 * @module @openai-harness/session-controller/client
 */

export * from "./event-source";
export * from "./session.controller";
export * from "./rpc.transport";
export * from "./use.session.journal";
