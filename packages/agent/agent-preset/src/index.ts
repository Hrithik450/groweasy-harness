/**
 * Declarative agent presets.
 *
 * The reference deepseek-harness registers each preset through an
 * `agentPresets` registry service in `[Service.init]`. This application has no
 * preset-registry service yet, so the faithful minimal shape is data plus the
 * lookup and expansion helpers: the host binds its canonical tool registry at
 * the application shim instead of owning a loader or profile system.
 *
 * @module @openai-harness/agent-preset
 */

export * from "./presets";
export * from "./defaults";
