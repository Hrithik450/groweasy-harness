/**
 * Monotonic ToolGuard pipeline ported from DeepSeek (@deepseek-ai/dsh-tools).
 *
 * Evaluated before tool execution. Returning a reason string denies the call.
 * Returning undefined leaves it unchanged. Because guards have no allow
 * override, ordering cannot turn a denial back into permission.
 *
 * @module @openai-harness/tools/guards/tool-guard
 */

import type { ToolExecution } from "../types";

export type ToolGuard = (
  execution: Readonly<ToolExecution>,
) => string | undefined;

export class ToolGuardPipeline {
  private readonly guards: ToolGuard[] = [];

  /**
   * Register a monotonic guard. Returns an unregister disposer function.
   */
  register(guard: ToolGuard): () => void {
    this.guards.push(guard);
    return () => {
      const idx = this.guards.indexOf(guard);
      if (idx !== -1) {
        this.guards.splice(idx, 1);
      }
    };
  }

  /**
   * Evaluates all registered guards monotonically.
   * Returns the first denial reason encountered, or undefined if allowed.
   */
  evaluate(execution: Readonly<ToolExecution>): string | undefined {
    for (const guard of this.guards) {
      const denial = guard(execution);
      if (denial !== undefined) {
        return denial;
      }
    }
    return undefined;
  }

  get length(): number {
    return this.guards.length;
  }
}
