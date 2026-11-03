/**
 * Pure session read/derive layer, client-safe and storage-free.
 *
 * This package owns the functions that turn a committed session event window
 * into client-renderable state: surface items, turns, the model-visible chat
 * transcript, tool timelines, live assistant/prompt overlays, projection
 * units, the host pub/sub seam, and the client-safe session view assembly.
 *
 * Persistence, the concrete event/assistant buses, the session controller,
 * and the agent/follow adapters stay host-side; they import this package
 * through the application shims.
 *
 * @module @openai-harness/session-projection
 */

export * from "./buses";
export * from "./derive";
export * from "./projections";
export * from "./view";
