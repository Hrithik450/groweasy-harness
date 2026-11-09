/**
 * Session Controller: the Session RPC surface and its host seams.
 *
 * The Gateway forwards every `session.*` method to the `sessionController`
 * service. This package owns the method bodies, the follow stream, and the
 * turn-aligned paging. It imports only workspace packages and the two services
 * the host injects:
 *
 * - `sessionFollow` — durable session storage and the committed-event /
 *   assistant-frame buses.
 * - `sessionAgent` — the host's agent workflow and block-submission text.
 *
 * @module @openai-harness/session-controller
 */

import type { SessionController } from "./session.controller";

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Session commands, cold reads, and the live follow stream. */
    sessionController: SessionController;
  }
}

export * from "./types";
export * from "./errors";
export * from "./event-page";
export * from "./follow.stream";
export * from "./lock";
export { default } from "./session.controller";
export { SessionController } from "./session.controller";
