import type { ContentBlock, UserMessage } from "@openai-harness/llm";
import type { JsonValue } from "@openai-harness/util-values";
import type {
  ToolErrorInfo,
  ToolExecution,
  ToolExecutionResult,
  ToolRunContext,
} from "./types";

/**
 * Pre-dispatch decision. `allow` runs the call; `deny` materializes its
 * model-facing reason and optional structured identity; `cancel` selects the
 * canonical pre-dispatch cancellation result without presenting a policy
 * denial. Input rewriting is excluded because arguments are already
 * materialized and dispatched.
 */
export type PreToolDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string; info?: ToolErrorInfo }
  | { kind: "cancel" };

/**
 * Post-dispatch decision: accept the settled result (optionally replacing
 * either its model-facing `content` or its canonical `value`), attach context
 * for the next request, or block by turning corrective feedback into an error.
 * An accept decision may not replace both `content` and `value`.
 */
export type PostToolDecision =
  | {
      kind: "accept";
      content?: ContentBlock[];
      value?: never;
      additionalContexts?: UserMessage[];
    }
  | {
      kind: "accept";
      value: JsonValue;
      content?: never;
      additionalContexts?: UserMessage[];
    }
  | {
      kind: "block";
      feedback: ContentBlock[];
      additionalContexts?: UserMessage[];
    };

/**
 * The three tool-pipeline waterfalls. A hook receives the call and a `next`
 * that delegates to the rest of the waterfall; it may inspect, replace, or
 * short-circuit the delegated outcome.
 */
export interface ToolHooks {
  preExecute(
    exec: Readonly<ToolExecution>,
    next: () => Promise<PreToolDecision>,
  ): Promise<PreToolDecision>;
  execute(
    exec: ToolRunContext,
    next: () => Promise<ToolExecutionResult>,
  ): Promise<ToolExecutionResult>;
  postExecute(
    exec: Readonly<ToolExecution>,
    result: Readonly<ToolExecutionResult>,
    next: () => Promise<PostToolDecision>,
  ): Promise<PostToolDecision>;
}

export type PreExecuteHook = ToolHooks["preExecute"];
export type ExecuteHook = ToolHooks["execute"];
export type PostExecuteHook = ToolHooks["postExecute"];

const ALLOW: PreToolDecision = { kind: "allow" };
const ACCEPT: PostToolDecision = { kind: "accept" };

/**
 * Waterfall registry for the registry-owned `pre-execute`, around-execute, and
 * `post-execute` pipeline stages. Hooks run in registration order: the first
 * registered wraps outermost and `next()` delegates inward.
 */
export class ToolHookRegistry {
  private readonly preExecuteHooks: PreExecuteHook[] = [];
  private readonly executeHooks: ExecuteHook[] = [];
  private readonly postExecuteHooks: PostExecuteHook[] = [];

  /** Register a pre-dispatch hook. Returns an idempotent disposer. */
  usePreExecute(hook: PreExecuteHook): () => void {
    return this.add(this.preExecuteHooks, hook);
  }

  /** Register an around-dispatch hook. Returns an idempotent disposer. */
  useExecute(hook: ExecuteHook): () => void {
    return this.add(this.executeHooks, hook);
  }

  /** Register a post-dispatch hook. Returns an idempotent disposer. */
  usePostExecute(hook: PostExecuteHook): () => void {
    return this.add(this.postExecuteHooks, hook);
  }

  /**
   * Run the pre-execute waterfall. Defaults to `allow` when no hook (or no
   * `next`) decides otherwise.
   */
  async runPreExecute(
    exec: Readonly<ToolExecution>,
    next: () => Promise<PreToolDecision> = async () => ALLOW,
  ): Promise<PreToolDecision> {
    const hooks = [...this.preExecuteHooks];
    const dispatch = (index: number): Promise<PreToolDecision> => {
      const hook = hooks[index];
      return hook === undefined
        ? next()
        : hook(exec, () => dispatch(index + 1));
    };
    return dispatch(0);
  }

  /**
   * Run the around-dispatch waterfall. The terminal `next` is the registered
   * tool body (or whatever the caller supplies).
   */
  async runExecute(
    exec: ToolRunContext,
    next: () => Promise<ToolExecutionResult>,
  ): Promise<ToolExecutionResult> {
    const hooks = [...this.executeHooks];
    const dispatch = (index: number): Promise<ToolExecutionResult> => {
      const hook = hooks[index];
      return hook === undefined
        ? next()
        : hook(exec, () => dispatch(index + 1));
    };
    return dispatch(0);
  }

  /**
   * Run the post-execute waterfall. Defaults to `accept` when no hook (or no
   * `next`) decides otherwise.
   */
  async runPostExecute(
    exec: Readonly<ToolExecution>,
    result: Readonly<ToolExecutionResult>,
    next: () => Promise<PostToolDecision> = async () => ACCEPT,
  ): Promise<PostToolDecision> {
    const hooks = [...this.postExecuteHooks];
    const dispatch = (index: number): Promise<PostToolDecision> => {
      const hook = hooks[index];
      return hook === undefined
        ? next()
        : hook(exec, result, () => dispatch(index + 1));
    };
    return dispatch(0);
  }

  private add<T>(bucket: T[], hook: T): () => void {
    bucket.push(hook);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const index = bucket.indexOf(hook);
      if (index !== -1) bucket.splice(index, 1);
    };
  }
}

/** Shared instance the canonical registry and call sites register hooks on. */
export const toolHooks = new ToolHookRegistry();
