/**
 * Tool registry, scoring contract, and pre/guard/around/post execution
 * pipeline.
 *
 * This package owns the tool vocabulary and the registry that runs one call to
 * completion. Execution is host-supplied: a call carries its agent, signal, and
 * scope, and the registry never imports the application's session, model
 * driver, or product tools.
 *
 * @module @openai-harness/tools
 */

export * from "./types";
export * from "./registry";
export * from "./schema";
export * from "./context";
export * from "./json-schema";
export * from "./presentation";
export * from "./hooks";
export * from "./guards";
export * from "./runtime";
