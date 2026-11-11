/**
 * Dependency binding for the shared client state layer.
 *
 * The package owns no application aliases and no gateway URL. Everything the
 * hooks need from the application — the RPC client, the session-journal hook,
 * the optimistic-prompt fold, id minting, and the business-profile transport —
 * is injected once by the application shim:
 *
 * ```ts
 * configureClientSession({
 *   rpc: () => getRpcClient(),
 *   useSessionJournal,
 * });
 * ```
 *
 * @module @openai-harness/client-ui-session/config
 */

import type { SessionEvent } from "@openai-harness/session";
import type { OptimisticPrompt } from "./internal/pending";

/**
 * Structural subset of the gateway RPC client used by the chat stream.
 *
 * Method syntax keeps the binding bivariant, so the application's typed
 * generic client is assignable without a cast.
 */
export interface RpcClientLike {
  call(method: string, params?: unknown, options?: unknown): Promise<unknown>;
}

/** An RPC client instance or a lazy provider (e.g. a HMR-safe singleton). */
export type RpcClientProvider = RpcClientLike | (() => RpcClientLike);

/** Contiguous event window exposed by the session controller. */
export interface SessionEventWindowLike {
  readonly events: readonly SessionEvent[];
  readonly hasMore: boolean;
  readonly revision: number;
}

/** Live assistant text that has not committed to the durable log yet. */
export interface SessionAssistantStreamLike {
  readonly attemptId: string;
  readonly turn: number;
  readonly step: number;
  readonly text: string;
}

/** Snapshot of one open session journal. */
export interface SessionControllerSnapshotLike {
  readonly sessionId: string;
  readonly status: "closed" | "loading" | "open" | "error";
  readonly window: SessionEventWindowLike;
  readonly baseSeq: number | undefined;
  readonly loadingOlder: boolean;
  readonly assistantStream?: SessionAssistantStreamLike;
  readonly error?: unknown;
}

/** Controller surface the chat UI drives. */
export interface SessionControllerLike {
  readonly sessionId: string;
  getSnapshot(): SessionControllerSnapshotLike;
  subscribe(listener: () => void): () => void;
  open(): void;
  close(): void;
  loadOlder(limit?: number): Promise<void>;
}

/** One session journal binding returned by the injected React hook. */
export interface SessionJournalBindingLike {
  readonly snapshot: SessionControllerSnapshotLike;
  readonly controller: SessionControllerLike;
}

/** App-owned React hook that opens one session journal. */
export type SessionJournalHook = (sessionId: string) => SessionJournalBindingLike;

/** Fold that keeps submitted prompts until their durable message arrives. */
export type PendingPromptsDerivation = (
  events: readonly SessionEvent[],
  prompts: readonly OptimisticPrompt[],
) => OptimisticPrompt[];

/** Application bindings the hooks consume. Every field is optional at rest. */
export interface ClientSessionDependencies {
  /** Gateway RPC client or a lazy provider. */
  rpc?: RpcClientProvider;
  /** Session-journal hook; required before `useChatStream` renders. */
  useSessionJournal?: SessionJournalHook;
  /** Replaces the default optimistic-prompt fold. */
  pendingPrompts?: PendingPromptsDerivation;
  /** Replaces the default UUID v4 minter. */
  createId?: () => string;
  /** Transport used by `useBusinessProfile` and logout. */
  fetch?: typeof fetch;
  /** Business-profile connector endpoint. */
  businessProfileUrl?: string;
  /** Logout endpoint. */
  logoutUrl?: string;
}

let dependencies: ClientSessionDependencies = {};

/**
 * Bind application dependencies. Calls merge, so shims can configure only the
 * bindings they own.
 */
export function configureClientSession(
  next: ClientSessionDependencies,
): void {
  dependencies = { ...dependencies, ...next };
}

/** Current bindings. The hooks read this at call time. */
export function getClientSessionDependencies(): Readonly<ClientSessionDependencies> {
  return dependencies;
}

/** Clear every binding. Primarily for tests. */
export function resetClientSession(): void {
  dependencies = {};
}

/**
 * Resolve the bound RPC client.
 * @throws when the application shim has not called `configureClientSession`.
 */
export function resolveRpcClient(): RpcClientLike {
  const provider = dependencies.rpc;
  if (provider === undefined) {
    throw new Error(
      "@openai-harness/client-ui-session: configureClientSession({ rpc }) must be called before using the chat-stream transport.",
    );
  }
  return typeof provider === "function" ? provider() : provider;
}
