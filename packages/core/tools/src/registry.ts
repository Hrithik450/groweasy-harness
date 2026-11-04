import type { ContentBlock, UserMessage } from "@openai-harness/llm";
import type { JsonValue } from "@openai-harness/util-values";
import type {
  OpenAIFunctionTool,
  ToolDefinition,
  ToolErrorInfo,
  ToolExecution,
  ToolExecutionFailure,
  ToolExecutionInput,
  ToolExecutionMode,
  ToolExecutionResult,
  ToolExecutionSuccess,
  ToolRunContext,
  ToolSchema,
} from "./types";
import { ToolArgsError, ToolNotFoundError, toOpenAITools } from "./types";
import { ToolHookRegistry, toolHooks } from "./hooks";
import type { PreToolDecision } from "./hooks";
import { validateArgs } from "./schema";
import { assertSupportedJsonSchema, isPlainJsonRecord } from "./json-schema";
import {
  TOOL_TIMEOUT,
  TimeoutReason,
  ToolGuardPipeline,
  createTimeoutResult,
  deadline,
  timeoutOf,
  type ToolGuard,
} from "./guards";

/** Canonical error code for cancellation after a tool body was invoked. */
export const TOOL_ABORTED = "ABORTED";

/** Canonical error code for cancellation before a tool body was invoked. */
export const TOOL_ABORTED_BEFORE_DISPATCH = "ABORTED_BEFORE_DISPATCH";

/**
 * Per-scope filter over global tools. Restrictions intersect; each layer can
 * only remove names, and scoped registrations remain visible.
 */
export interface ToolRestriction {
  /** Global tool names that stay visible; everything else is removed. */
  readonly allow?: readonly string[];
  /** Global tool names removed from visibility. */
  readonly deny?: readonly string[];
}

/** One restriction compiled at registration for repeated live lookup. */
interface CompiledToolRestriction {
  readonly allow?: ReadonlySet<string>;
  readonly deny?: ReadonlySet<string>;
}

/** Observe the frozen, materialized final outcome of one execution. */
export type ToolResultObserver = (
  exec: Readonly<ToolExecution>,
  result: Readonly<ToolExecutionResult>,
) => void;

/**
 * Tool registry and execution pipeline.
 *
 * `execute` is the single dispatch path: direct callers and the `executeTool`
 * adapter both traverse pre-execute hooks, monotonic guards, the timeout,
 * around-execute hooks, the tool body, definition-owned content projection,
 * post-execute hooks, content finalization, and result observers. Hooks can
 * never be bypassed.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly guardPipeline = new ToolGuardPipeline();

  /**
   * Per-scope restriction layers keyed by scope. Every layer can only remove
   * names, so nested restrictions for one scope intersect; the symbol token
   * lets an undo remove exactly its own layer without disturbing the others.
   */
  private readonly scopeRestrictions = new Map<
    string,
    Map<symbol, CompiledToolRestriction>
  >();
  private readonly changeListeners = new Set<() => void>();
  private readonly resultListeners = new Set<ToolResultObserver>();

  /**
   * Pipeline waterfalls. The canonical registry shares the module singleton so
   * hooks registered through `toolHooks` reach every direct execution.
   */
  constructor(readonly hooks: ToolHookRegistry = new ToolHookRegistry()) {}

  /**
   * Register a global tool.
   * @param tool - schema, output contract, body, and optional pipeline callbacks.
   * @returns the exact disposer that removes this registration.
   * @throws when the name is already registered or the tool contract is invalid.
   */
  register(tool: ToolDefinition): () => void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool "${tool.name}" is already registered`);
    }
    const output = (tool as Partial<ToolDefinition>).output;
    if (
      output === undefined ||
      typeof output !== "object" ||
      typeof output.render !== "function" ||
      (output.presentationMeta !== undefined &&
        typeof output.presentationMeta !== "function")
    ) {
      throw new TypeError(
        `tool "${tool.name}" must declare output { schema, render, presentationMeta? }`,
      );
    }
    assertSupportedJsonSchema(output.schema);
    if (
      tool.timeoutMs !== undefined &&
      (!Number.isFinite(tool.timeoutMs) || tool.timeoutMs <= 0)
    ) {
      throw new TypeError(
        `tool "${tool.name}" timeoutMs must be a positive finite number`,
      );
    }
    this.tools.set(tool.name, tool);
    this.notifyChange();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.tools.get(tool.name) !== tool) return;
      this.tools.delete(tool.name);
      this.notifyChange();
    };
  }

  /**
   * Restrict the named scope to a filtered view of the global registrations.
   *
   * Every layer intersects, so two `allow` filters compose and any matching
   * `deny` removes a name. Empty filters and unknown names fail loudly: an
   * empty filter is almost always a materialized-empty-config bug, and an
   * unknown name silently having no effect hides a composition mistake.
   * @param scope - agent preset / session slug the restriction applies to.
   * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
   * @returns the exact disposer that lifts this layer.
   */
  restrict(scope: string, filter: ToolRestriction): () => void {
    const { allow, deny } = filter;
    if (allow === undefined && deny === undefined) {
      throw new Error(
        "tools.restrict() requires an `allow` and/or `deny` filter",
      );
    }
    const named = [...(allow ?? []), ...(deny ?? [])];
    const unknown = [...new Set(named)].filter((name) => !this.tools.has(name));
    if (unknown.length > 0) {
      const known = [...this.tools.keys()].sort();
      throw new Error(
        `tools.restrict() names unknown global tool${unknown.length > 1 ? "s" : ""} ${unknown
          .map((name) => `"${name}"`)
          .join(", ")}; known global tools: ${known.join(", ") || "(none)"}`,
      );
    }
    const compiled: CompiledToolRestriction = {
      ...(allow !== undefined ? { allow: new Set(allow) } : {}),
      ...(deny !== undefined ? { deny: new Set(deny) } : {}),
    };

    const layers =
      this.scopeRestrictions.get(scope) ??
      new Map<symbol, CompiledToolRestriction>();

    const token = Symbol(scope);
    layers.set(token, compiled);
    this.scopeRestrictions.set(scope, layers);
    this.notifyChange();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.scopeRestrictions.get(scope);
      if (current === undefined) return;
      current.delete(token);
      if (current.size === 0) this.scopeRestrictions.delete(scope);
      this.notifyChange();
    };
  }

  /**
   * Register a monotonic execution guard evaluated after every pre-execute
   * hook and before dispatch. Returning a reason denies the call; returning
   * `undefined` leaves it unchanged. Because guards have no allow result,
   * listener ordering cannot turn a denial back into permission.
   * @param guard - synchronous check; a returned string denies the execution.
   * @returns the exact disposer that unregisters the guard.
   */
  guard(guard: ToolGuard): () => void {
    return this.guardPipeline.register(guard);
  }

  /**
   * Observe registration and scope-restriction changes. Listeners are
   * registry-subject, not scope-filtered: any change may alter a scope's next
   * assembly. A throwing listener is contained.
   * @returns the exact disposer that stops observing.
   */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Observe the final, materialized, frozen result of every execution.
   * Observers cannot mutate the outcome; a throwing or rejecting observer is
   * contained and reported without failing the call.
   * @returns the exact disposer that stops observing.
   */
  onResult(observer: ToolResultObserver): () => void {
    this.resultListeners.add(observer);
    return () => {
      this.resultListeners.delete(observer);
    };
  }

  /**
   * Look up a tool as one scope sees it. A name filtered out by any
   * restriction layer on that scope reads as absent.
   * @param scope - agent preset / session slug; omitted = the global view.
   */
  get(name: string, scope?: string): ToolDefinition | undefined {
    if (!this.admits(scope, name)) return undefined;
    return this.tools.get(name);
  }

  /**
   * List the definitions visible to a scope in registration order.
   * Model-facing projections should prefer {@link schemas}.
   * @param scope - agent preset / session slug; omitted = the global view.
   */
  list(scope?: string): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((tool) =>
      this.admits(scope, tool.name),
    );
  }

  /**
   * Project the visible tools onto their model-facing schema fields. Execution,
   * scheduling, and presentation metadata never cross this boundary.
   * @param scope - agent preset / session slug; omitted = the global view.
   */
  schemas(scope?: string): ToolSchema[] {
    return this.list(scope).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      ...(tool.deferLoading === true
        ? { deferLoading: tool.deferLoading }
        : {}),
    }));
  }

  /**
   * Classify a pending call through the scope's visible definition. Only an
   * exact `true` from `isConcurrencySafe` is parallel; an unknown, hidden,
   * undeclared, non-`true`, or throwing classifier is exclusive.
   */
  executionMode(exec: ToolExecutionInput): ToolExecutionMode {
    const tool = this.get(exec.name, executionScope(exec));
    const classify = tool?.isConcurrencySafe;
    if (typeof classify !== "function") return { kind: "exclusive" };
    try {
      return classify.call(tool, exec.arguments) === true
        ? { kind: "parallel" }
        : { kind: "exclusive" };
    } catch {
      return { kind: "exclusive" };
    }
  }

  toOpenAITools(
    filter?: string[] | { names?: string[] },
  ): OpenAIFunctionTool[] {
    if (Array.isArray(filter)) {
      const list = filter
        .map((name) => this.get(name))
        .filter((tool): tool is ToolDefinition => tool !== undefined);
      return toOpenAITools(list);
    }
    if (filter?.names !== undefined && filter.names.length > 0) {
      const names = new Set(filter.names);
      return toOpenAITools(this.list().filter((tool) => names.has(tool.name)));
    }
    return toOpenAITools(this.list());
  }

  /**
   * Execute through the single pipeline: materialize/validate arguments,
   * build the execution, pre-execute hooks, monotonic guards, timeout,
   * around-execute hooks, the tool body, output render, `projectContent`,
   * post-execute hooks, `finalizeContent`, deferred contexts/concludeTurn,
   * materialization, and result observers.
   *
   * Tool and hook failures resolve as materialized error results; an invisible
   * tool reports `UNKNOWN_TOOL`. Cancellation arriving before dispatch selects
   * `ABORTED_BEFORE_DISPATCH`; cancellation after a successful body selects
   * `ABORTED`. Timeout is a distinct failure and never reported as
   * cancellation.
   * @param input - the typed same-process call.
   * @returns the materialized final result.
   */
  async execute(input: ToolExecutionInput): Promise<ToolExecutionResult> {
    const deferredContexts: UserMessage[] = [];
    let concludesTurn = false;
    const concluding = (): boolean => concludesTurn;

    const name = input.name;
    const scope = executionScope(input);
    const callId = input.callId;
    // Capture definition-owned callbacks before argument materialization: an
    // arguments getter must not be able to replace the projection/finalizer
    // that owns this execution.
    const visible = this.get(name, scope);
    const capturedProjector = visible?.projectContent?.bind(visible);
    const capturedFinalizer = visible?.finalizeContent?.bind(visible);

    const base = {
      callId,
      name,
      signal: input.signal,
      ...(scope !== undefined ? { scope } : {}),
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
    };
    const buildExecution = (argumentsValue: unknown): ToolRunContext => ({
      ...base,
      arguments: argumentsValue,
      deferContext(context: UserMessage): void {
        deferredContexts.push(context);
      },
      concludeTurn(): void {
        concludesTurn = true;
      },
    });

    // 1. Materialize arguments across the lossless-JSON boundary.
    let materialized: JsonValue;
    try {
      materialized = deepFreeze(snapshotJsonValue(input.arguments));
    } catch (error: unknown) {
      const exec = buildExecution(undefined);
      return this.finish(
        exec,
        toErrorResult(error),
        capturedFinalizer,
        deferredContexts,
        concluding,
        true,
      );
    }

    // 2. Build the execution.
    const exec = buildExecution(materialized);

    // 3. A name invisible to the scope is denied before policy observes it.
    if (visible === undefined) {
      return this.finish(
        exec,
        toErrorResult(new ToolNotFoundError(name)),
        capturedFinalizer,
        deferredContexts,
        concluding,
        true,
      );
    }

    // 4. Validate the materialized arguments against the tool's parameters.
    const violations = validateArgs(visible.parameters, materialized);
    if (violations.length > 0) {
      return this.finish(
        exec,
        toErrorResult(new ToolArgsError(violations)),
        capturedFinalizer,
        deferredContexts,
        concluding,
        true,
      );
    }

    // 5. Cancellation that arrived before any policy ran is final.
    if (input.signal.aborted) {
      return this.finish(
        exec,
        abortedBeforeDispatchResult(),
        capturedFinalizer,
        deferredContexts,
        concluding,
        true,
      );
    }

    // 6. Pre-execute waterfall.
    let decision: PreToolDecision;
    try {
      decision = await this.hooks.runPreExecute(exec);
    } catch (error: unknown) {
      return this.finish(
        exec,
        toErrorResult(error),
        capturedFinalizer,
        deferredContexts,
        concluding,
        true,
      );
    }

    if (decision.kind === "deny") {
      return this.finalize(
        exec,
        denialResult(decision.reason, decision.info),
        visible,
        capturedProjector,
        capturedFinalizer,
        deferredContexts,
        concluding,
        input.signal,
      );
    }

    if (decision.kind === "cancel") {
      return this.finalize(
        exec,
        abortedBeforeDispatchResult(),
        visible,
        capturedProjector,
        capturedFinalizer,
        deferredContexts,
        concluding,
        input.signal,
      );
    }

    // 7. Monotonic guards run after the extensible policy and cannot re-allow.
    const denial = this.guardPipeline.evaluate(exec);
    if (denial !== undefined) {
      return this.finalize(
        exec,
        denialResult(denial),
        visible,
        capturedProjector,
        capturedFinalizer,
        deferredContexts,
        concluding,
        input.signal,
      );
    }

    // 8. Cancellation observed after the gate still precedes dispatch.
    if (input.signal.aborted) {
      return this.finalize(
        exec,
        abortedBeforeDispatchResult(),
        visible,
        capturedProjector,
        capturedFinalizer,
        deferredContexts,
        concluding,
        input.signal,
      );
    }

    // 9-14. Timeout, around-execute, body, and output render.
    const dispatched = await this.dispatch(exec, visible, input.signal);

    return this.finalize(
      exec,
      dispatched,
      visible,
      capturedProjector,
      capturedFinalizer,
      deferredContexts,
      concluding,
      input.signal,
    );
  }

  /** Whether every restriction layer for one scope admits a global name. */
  private admits(scope: string | undefined, name: string): boolean {
    if (scope === undefined) return true;
    const layers = this.scopeRestrictions.get(scope);
    if (layers === undefined) return true;
    for (const restriction of layers.values()) {
      if (
        (restriction.allow !== undefined && !restriction.allow.has(name)) ||
        (restriction.deny !== undefined && restriction.deny.has(name))
      ) {
        return false;
      }
    }
    return true;
  }

  /** Notify observers without letting one listener break registry mutation. */
  private notifyChange(): void {
    for (const listener of Array.from(this.changeListeners)) {
      try {
        listener();
      } catch (error: unknown) {
        console.warn(
          `[ToolRegistry] onChange listener failed: ${errorMessage(error)}`,
        );
      }
    }
  }

  /** Notify result observers without exposing a mutation or error channel. */
  private notifyResult(exec: ToolExecution, result: ToolExecutionResult): void {
    Object.freeze(exec);
    for (const observer of Array.from(this.resultListeners)) {
      try {
        const returned: unknown = observer(exec, result);
        void Promise.resolve(returned).catch((error: unknown) => {
          console.warn(
            `[ToolRegistry] onResult observer failed for "${exec.name}": ${errorMessage(error)}`,
          );
        });
      } catch (error: unknown) {
        console.warn(
          `[ToolRegistry] onResult observer failed for "${exec.name}": ${errorMessage(error)}`,
        );
      }
    }
  }

  /**
   * Run the timeout, around-execute waterfall, tool body, and output render.
   * Body failures become results so post-execute policy still observes them.
   */
  private async dispatch(
    exec: ToolRunContext,
    tool: ToolDefinition,
    callerSignal: AbortSignal,
  ): Promise<ToolExecutionResult> {
    if (callerSignal.aborted) return abortedBeforeDispatchResult();

    const timeoutMs = tool.timeoutMs;
    if (timeoutMs === undefined) {
      return this.runBody(exec, tool, callerSignal);
    }

    const scoped = deadline(exec.signal, timeoutMs, TOOL_TIMEOUT);
    const race = timeoutRace(scoped.signal, timeoutMs);
    const dispatchExec: ToolRunContext = { ...exec, signal: scoped.signal };
    try {
      return await Promise.race([
        this.runBody(dispatchExec, tool, callerSignal),
        race.promise,
      ]);
    } catch (error: unknown) {
      if (
        timeoutOf(error, TOOL_TIMEOUT) ||
        timeoutOf(scoped.signal, TOOL_TIMEOUT)
      ) {
        return createTimeoutResult(timeoutMs, tool.name);
      }
      return toErrorResult(error);
    } finally {
      race.dispose();
      scoped.dispose();
    }
  }

  /**
   * Run the around-execute waterfall and the registered body. A body error is
   * normalized to a result; caller cancellation after a successful body wins
   * over success.
   */
  private async runBody(
    exec: ToolRunContext,
    tool: ToolDefinition,
    callerSignal: AbortSignal,
  ): Promise<ToolExecutionResult> {
    let result: ToolExecutionResult;
    try {
      result = await this.hooks.runExecute(exec, () =>
        this.invokeBody(exec, tool),
      );
    } catch (error: unknown) {
      return toErrorResult(error);
    }
    return !result.isError && callerSignal.aborted
      ? abortedResult(result)
      : result;
  }

  /** Invoke the tool body, render its canonical value, and normalize failures. */
  private async invokeBody(
    exec: ToolRunContext,
    tool: ToolDefinition,
  ): Promise<ToolExecutionResult> {
    try {
      const returned = await tool.execute(exec.arguments, exec);
      return this.createSuccessResult(exec, tool, returned);
    } catch (error: unknown) {
      return toErrorResult(error);
    }
  }

  /** Freeze, render, and optionally project one successful body value. */
  private createSuccessResult(
    exec: ToolExecution,
    tool: ToolDefinition,
    candidate: unknown,
  ): ToolExecutionSuccess {
    // The body's value is tool-owned and already typed by its output
    // declaration; freeze it in place so neither policy nor an observer can
    // mutate what the tool returned.
    const value = deepFreeze(candidate as JsonValue);
    const content = tool.output.render(exec.arguments, value);
    const meta = tool.output.presentationMeta?.(exec.arguments, value);
    return {
      isError: false,
      value,
      content,
      ...(meta !== undefined ? { meta } : {}),
    };
  }

  /**
   * Run definition-owned projection, post-execute policy, the post-policy
   * cancellation check, and last-mile content finalization.
   */
  private async finalize(
    exec: ToolRunContext,
    dispatched: ToolExecutionResult,
    tool: ToolDefinition,
    projector: ToolDefinition["projectContent"],
    finalizer: ToolDefinition["finalizeContent"],
    deferredContexts: readonly UserMessage[],
    concluding: () => boolean,
    callerSignal: AbortSignal,
  ): Promise<ToolExecutionResult> {
    // Deferred contexts ride the result entering post-execute, so policy and
    // result observers both see them.
    let result = withAdditionalContexts(dispatched, deferredContexts);

    if (projector !== undefined) {
      try {
        const content = projector(exec, result);
        if (content !== undefined) result = { ...result, content };
      } catch (error: unknown) {
        return this.finish(
          exec,
          toErrorResult(error),
          finalizer,
          deferredContexts,
          concluding,
          false,
        );
      }
    }

    try {
      result = await this.applyPostDecision(exec, tool, result);
    } catch (error: unknown) {
      return this.finish(
        exec,
        toErrorResult(error),
        finalizer,
        deferredContexts,
        concluding,
        false,
      );
    }

    if (!result.isError && callerSignal.aborted) {
      result = abortedResult(result);
    }

    return this.finish(
      exec,
      result,
      finalizer,
      deferredContexts,
      concluding,
      false,
    );
  }

  /** Apply one post-execute decision to a settled result. */
  private async applyPostDecision(
    exec: ToolExecution,
    tool: ToolDefinition,
    result: ToolExecutionResult,
  ): Promise<ToolExecutionResult> {
    const decision = await this.hooks.runPostExecute(exec, result);
    const decisionContexts = decision.additionalContexts ?? [];
    if (decision.kind === "block") {
      const message = failureMessageFromContent(decision.feedback);
      return {
        isError: true,
        error: { message },
        content: decision.feedback,
        ...(decisionContexts.length > 0
          ? { additionalContexts: decisionContexts }
          : {}),
      };
    }
    if (
      Object.hasOwn(decision, "content") &&
      Object.hasOwn(decision, "value")
    ) {
      throw new TypeError(
        "post-execute accept decision cannot replace both value and content",
      );
    }
    if (Object.hasOwn(decision, "value")) {
      if (result.isError) {
        throw new TypeError(
          "post-execute cannot replace the value of a failed result",
        );
      }
      const replaced = this.createSuccessResult(exec, tool, decision.value);
      return withAdditionalContexts(replaced, decisionContexts);
    }
    return withAdditionalContexts(
      decision.content !== undefined
        ? { ...result, content: decision.content }
        : result,
      decisionContexts,
    );
  }

  /**
   * Apply last-mile content finalization, attach conclusion/deferred-context
   * state for paths that bypassed `finalize`, materialize the authoritative
   * result, and notify observers exactly once.
   */
  private finish(
    exec: ToolRunContext,
    result: ToolExecutionResult,
    finalizer: ToolDefinition["finalizeContent"],
    deferredContexts: readonly UserMessage[],
    concluding: () => boolean,
    attachDeferred: boolean,
  ): ToolExecutionResult {
    let candidate = attachDeferred
      ? withAdditionalContexts(result, deferredContexts)
      : result;

    if (!candidate.isError && concluding()) {
      candidate = { ...candidate, concludesTurn: true };
    }

    if (finalizer !== undefined) {
      try {
        const content = finalizer(exec, candidate);
        if (content !== undefined) candidate = { ...candidate, content };
      } catch (error: unknown) {
        candidate = toErrorResult(error);
      }
    }

    const materialized = materialize(candidate);
    this.notifyResult(exec, materialized);
    return materialized;
  }
}

/**
 * Resolve the registry view scope for a call: an explicit `scope`, else the
 * calling agent's preset, else the global view.
 */
function executionScope(exec: ToolExecutionInput): string | undefined {
  return exec.scope ?? exec.agent?.session.header.agentPreset;
}

/** Merge deferred/decision context ahead of any context already on a result. */
function withAdditionalContexts(
  result: ToolExecutionResult,
  contexts: readonly UserMessage[],
): ToolExecutionResult {
  if (contexts.length === 0) return result;
  return {
    ...result,
    additionalContexts: [...contexts, ...(result.additionalContexts ?? [])],
  };
}

/** Derive one failure message from policy feedback without changing its blocks. */
function failureMessageFromContent(content: ContentBlock[]): string {
  const text = content
    .map((block) =>
      block.type === "text" ? block.text : `[${block.type} content]`,
    )
    .join("\n");
  return text.length > 0 ? text : "tool result blocked by post-execute policy";
}

/** Best-effort human-readable message from an arbitrary thrown value. */
function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return error.message;
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
    return String(error);
  } catch {
    return "<unprintable thrown value>";
  }
}

/** Structured `{ name, code }` for a known tool failure, else undefined. */
function errorInfo(error: unknown): ToolErrorInfo | undefined {
  try {
    if (error instanceof ToolArgsError) {
      return { name: error.name, code: "INVALID_TOOL_ARGS" };
    }
    if (error instanceof ToolNotFoundError) {
      return { name: error.name, code: error.code };
    }
    if (error instanceof TimeoutReason) {
      return { name: "ToolTimeoutError", code: error.code };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function toErrorResult(error: unknown): ToolExecutionFailure {
  const message = errorMessage(error);
  const info = errorInfo(error);
  return {
    isError: true,
    error: { message, ...(info !== undefined ? { info } : {}) },
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

function denialResult(
  reason: string,
  info?: ToolErrorInfo,
): ToolExecutionFailure {
  return {
    isError: true,
    error: { message: reason, ...(info !== undefined ? { info } : {}) },
    content: [{ type: "text", text: `Error: ${reason}` }],
  };
}

/** Canonical result when cancellation supersedes success after body invocation. */
function abortedResult(prior?: ToolExecutionResult): ToolExecutionFailure {
  const additionalContexts = prior?.additionalContexts ?? [];
  return {
    isError: true,
    error: {
      message: "tool call aborted",
      info: { name: "AbortError", code: TOOL_ABORTED },
    },
    content: [{ type: "text", text: "Error: tool call aborted" }],
    ...(additionalContexts.length > 0 ? { additionalContexts } : {}),
  };
}

/** Canonical result when cancellation prevents tool body invocation. */
function abortedBeforeDispatchResult(
  prior?: ToolExecutionResult,
): ToolExecutionFailure {
  const additionalContexts = prior?.additionalContexts ?? [];
  return {
    isError: true,
    error: {
      message: "tool call aborted before dispatch",
      info: { name: "AbortError", code: TOOL_ABORTED_BEFORE_DISPATCH },
    },
    content: [
      { type: "text", text: "Error: tool call aborted before dispatch" },
    ],
    ...(additionalContexts.length > 0 ? { additionalContexts } : {}),
  };
}

/** One dispatch-scoped timeout rejection plus listener cleanup. */
interface TimeoutRace {
  readonly promise: Promise<never>;
  dispose(): void;
}

/**
 * Reject with a {@link TimeoutReason} only when the fused signal aborts for
 * this timeout. Caller cancellation leaves the promise pending so the body can
 * settle and the registry can select the cancellation result.
 */
function timeoutRace(signal: AbortSignal, timeoutMs: number): TimeoutRace {
  let onAbort: (() => void) | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    const rejectIfTimeout = (): void => {
      if (timeoutOf(signal, TOOL_TIMEOUT)) {
        reject(new TimeoutReason(TOOL_TIMEOUT, timeoutMs));
      }
    };
    if (signal.aborted) {
      rejectIfTimeout();
      return;
    }
    onAbort = rejectIfTimeout;
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    promise,
    dispose() {
      if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Snapshot one arbitrary value across the lossless-JSON boundary. Rejects
 * anything a durable tool result cannot represent: `undefined`, non-finite
 * numbers, functions/symbols/bigints, class instances, and cycles.
 */
function snapshotJsonValue(value: unknown): JsonValue {
  return snapshotAt(value, "arguments", new WeakSet<object>());
}

function snapshotAt(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): JsonValue {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `${path} is not losslessly JSON-serializable: non-finite number`,
        );
      }
      return value;
    case "object":
      break;
    default:
      throw new TypeError(
        `${path} is not losslessly JSON-serializable: ${typeof value}`,
      );
  }

  const record = value as object;
  if (seen.has(record)) {
    throw new TypeError(
      `${path} is not losslessly JSON-serializable: circular reference`,
    );
  }
  seen.add(record);

  if (Array.isArray(record)) {
    const detached = record.map((entry, index) =>
      snapshotAt(entry, `${path}[${index}]`, seen),
    );
    seen.delete(record);
    return detached;
  }

  if (!isPlainJsonRecord(record)) {
    throw new TypeError(
      `${path} is not losslessly JSON-serializable: non-plain object`,
    );
  }

  const source = record as Record<string, unknown>;
  const detached: Record<string, JsonValue> = {};
  for (const key of Object.keys(source)) {
    const entry = source[key];
    if (entry === undefined) {
      throw new TypeError(
        `${path}.${key} is not losslessly JSON-serializable: undefined`,
      );
    }
    detached[key] = snapshotAt(entry, `${path}.${key}`, seen);
  }
  seen.delete(record);
  return detached;
}

/** Recursively freeze a detached value without revisiting shared objects. */
function deepFreeze<T>(value: T): T {
  return freezeValue(value, new WeakSet<object>());
}

function freezeValue<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== "object") return value;
  const record = value as object;
  if (seen.has(record)) return value;
  seen.add(record);
  Object.freeze(record);
  for (const entry of Object.values(record)) {
    freezeValue(entry, seen);
  }
  return value;
}

/**
 * Build the authoritative, frozen commit outcome. The result object is copied
 * so later mutation of a policy-owned array cannot alter what observers saw.
 */
function materialize(result: ToolExecutionResult): ToolExecutionResult {
  if (result.isError) {
    return deepFreeze({
      isError: true as const,
      error: deepFreeze({
        message: result.error.message,
        ...(result.error.info !== undefined
          ? { info: { ...result.error.info } }
          : {}),
        ...(result.error.code !== undefined ? { code: result.error.code } : {}),
      }),
      content: [...result.content] as ContentBlock[],
      ...(result.meta !== undefined ? { meta: result.meta } : {}),
      ...(result.additionalContexts !== undefined
        ? { additionalContexts: [...result.additionalContexts] }
        : {}),
    });
  }

  return deepFreeze({
    isError: false as const,
    value: result.value,
    content: [...result.content] as ContentBlock[],
    ...(result.meta !== undefined ? { meta: result.meta } : {}),
    ...(result.additionalContexts !== undefined
      ? { additionalContexts: [...result.additionalContexts] }
      : {}),
    ...(result.concludesTurn === true ? { concludesTurn: true as const } : {}),
  });
}

/** The process-wide registry. Shares the `toolHooks` singleton by design. */
export const toolRegistry = new ToolRegistry(toolHooks);
