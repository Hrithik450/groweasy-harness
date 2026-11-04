/**
 * Cordis `tools` service.
 *
 * The reference harness exposes the tool runtime as a service
 * (`ToolRuntime extends Service`, `super(ctx, 'tools')`), so tool packages are
 * plugins that register through `ctx.tools.register(...)`. This module keeps
 * {@link ToolRegistry} as the pure execution engine and delegates the service
 * surface to one instance, which means the pipeline runs in exactly one place.
 *
 * The shared {@link toolHooks} registry is the default hook set: the app binds
 * its prerequisite gate there before tools load, and a host that needs a
 * private pipeline can pass its own registry in the config.
 *
 * @module @openai-harness/tools
 */

import { Service, type Context } from "@deepseek-ai/cordis";
import { ToolHookRegistry, toolHooks } from "./hooks";
import { ToolRegistry, toolRegistry } from "./registry";
import type {
  OpenAIFunctionTool,
  ToolDefinition,
  ToolExecutionInput,
  ToolExecutionMode,
  ToolExecutionResult,
  ToolSchema,
} from "./types";
import type { ToolRestriction, ToolResultObserver } from "./registry";
import type { ToolGuard } from "./guards";

/** Service configuration; the engine and its hooks are injectable for tests. */
export interface ToolRuntimeConfig {
  /**
   * Hooks the service pipeline reads. Defaults to the shared registry so the
   * host's pre-execute gate keeps applying to service-registered tools.
   */
  readonly hooks?: ToolHookRegistry;
  /**
   * Registry instance to expose. Defaults to a new registry over `hooks`.
   * Hosts that already own the process-wide registry pass it here so
   * `ctx.tools` and module-level consumers observe the same tools.
   */
  readonly registry?: ToolRegistry;
}

/**
 * Tool registry and execution pipeline mounted as `ctx.tools`.
 *
 * Scoped registrations shadow globals inside the engine; this service adds
 * only the Cordis lifecycle binding and the delegation, not a second pipeline.
 */
export class ToolRuntime extends Service {
  /** The engine every delegation targets. */
  readonly registry: ToolRegistry;

  constructor(ctx: Context, config: ToolRuntimeConfig = {}) {
    super(ctx, "tools");
    this.registry =
      config.registry ?? new ToolRegistry(config.hooks ?? toolHooks);
  }

  /** Register one tool definition; returns its disposer. */
  register(tool: ToolDefinition): () => void {
    return this.registry.register(tool);
  }

  /** Restrict visibility for one scope; returns the release disposer. */
  restrict(scope: string, filter: ToolRestriction): () => void {
    return this.registry.restrict(scope, filter);
  }

  /** Install a guard; returns its disposer. */
  guard(guard: ToolGuard): () => void {
    return this.registry.guard(guard);
  }

  /** Observe registry changes; returns the unsubscriber. */
  onChange(listener: () => void): () => void {
    return this.registry.onChange(listener);
  }

  /** Observe completed executions; returns the unsubscriber. */
  onResult(observer: ToolResultObserver): () => void {
    return this.registry.onResult(observer);
  }

  /** Resolve one tool, preferring the scope's shadowing registration. */
  get(name: string, scope?: string): ToolDefinition | undefined {
    return this.registry.get(name, scope);
  }

  /** List visible tools for one scope. */
  list(scope?: string): ToolDefinition[] {
    return this.registry.list(scope);
  }

  /** Project the visible tools into model-facing schemas. */
  schemas(scope?: string): ToolSchema[] {
    return this.registry.schemas(scope);
  }

  /** Resolve the execution mode for one call. */
  executionMode(exec: ToolExecutionInput): ToolExecutionMode {
    return this.registry.executionMode(exec);
  }

  /** Project the visible tools into OpenAI function tools. */
  toOpenAITools(
    ...args: Parameters<ToolRegistry["toOpenAITools"]>
  ): OpenAIFunctionTool[] {
    return this.registry.toOpenAITools(...args);
  }

  /** Run one call to completion through the shared pipeline. */
  execute(input: ToolExecutionInput): Promise<ToolExecutionResult> {
    return this.registry.execute(input);
  }
}

/**
 * The process-wide registry, exposed as a service-compatible handle.
 *
 * A host that has no Cordis tree (scripts, tests, the browser gateway's
 * pre-boot wiring) can still call `register`/`execute` without constructing a
 * service, and a Cordis host passes this same instance to
 * {@link ToolRuntime} so both views stay identical.
 */
export const sharedToolRuntime: Pick<
  ToolRuntime,
  | "register"
  | "restrict"
  | "guard"
  | "onChange"
  | "onResult"
  | "get"
  | "list"
  | "schemas"
  | "executionMode"
  | "toOpenAITools"
  | "execute"
> = toolRegistry;

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Tool registry and execution pipeline mounted by {@link ToolRuntime}. */
    tools: ToolRuntime;
  }
}
