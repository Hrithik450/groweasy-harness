/**
 * Framework-free agent vocabulary: the wire event union and loop defaults
 * shared by orchestrators, workflows, and host adapters.
 *
 * The live agent handle, inbox, and loop contracts stay in
 * `@openai-harness/agent-loop`; the application's `src/lib/core/agent` modules
 * stay thin re-exports that bind the host's `Session` type.
 *
 * @module @openai-harness/agent
 */

export * from "./runtime-types";
export * from "./constants";
