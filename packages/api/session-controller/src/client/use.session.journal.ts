"use client";

/**
 * React binding for one session journal controller.
 *
 * The controller is shared per (gateway client, sessionId): chat and the
 * right-hand detail bar mount the same hook, so the session log is followed
 * once and every consumer reads the same event window. The controller is
 * reference-counted — the first consumer opens the stream and the last
 * unmount closes it — and read through `useSyncExternalStore` with stable
 * subscribe/getSnapshot functions so React never re-subscribes between
 * renders.
 *
 * The gateway RPC client is never read from module-scope configuration. Pass it
 * as an instance, or as a lazy provider when the shell keeps a process-wide
 * singleton:
 *
 * ```ts
 * const useSessionJournal = createSessionJournalHook({ rpc: () => rpc });
 * ```
 *
 * @module @openai-harness/session-controller/client
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { RpcClient } from "@openai-harness/client-rpc";
import {
  SessionController,
  type SessionControllerSnapshot,
} from "./session.controller";
import {
  createRpcSessionTransport,
  type RpcSessionClient,
} from "./rpc.transport";

/** Controller snapshot plus its stable controller handle. */
export interface SessionJournalBinding {
  readonly snapshot: SessionControllerSnapshot;
  readonly controller: SessionController;
}

/** An RPC client instance or a lazy provider resolved at hook call time. */
export type SessionJournalRpc =
  | RpcClient
  | RpcSessionClient
  | (() => RpcClient | RpcSessionClient);

/** Options for {@link createSessionJournalHook}. */
export interface SessionJournalHookOptions {
  /** Gateway client instance or lazy provider. Never read from the environment. */
  rpc: SessionJournalRpc;
  /** Opening-window size; the transport may cap it. */
  limit?: number;
}

/** Injection shape accepted by `configureClientSession({ useSessionJournal })`. */
export type SessionJournalHook = (sessionId: string) => SessionJournalBinding;

/** One shared controller plus the number of mounted consumers. */
interface SharedJournal {
  readonly controller: SessionController;
  consumers: number;
}

/**
 * Controllers keyed by the resolved RPC instance, then by session id. The
 * instance is the identity component: every consumer that resolved the same
 * gateway client shares one follow stream per session.
 */
const sharedJournals = new WeakMap<
  object,
  Map<string, SharedJournal>
>();

/** Resolve an RPC instance from the injected value. */
function resolveRpc(rpc: SessionJournalRpc): RpcSessionClient {
  return typeof rpc === "function" ? rpc() : rpc;
}

/**
 * Return the shared controller for one (client, session), creating it on first
 * use. Creation never opens the stream; consumers do that from their effects.
 */
function getSharedJournal(
  client: RpcSessionClient,
  sessionId: string,
  limit?: number,
): SharedJournal {
  let bySession = sharedJournals.get(client);
  if (bySession === undefined) {
    bySession = new Map();
    sharedJournals.set(client, bySession);
  }

  const existing = bySession.get(sessionId);
  if (existing !== undefined) return existing;

  const created: SharedJournal = {
    controller: new SessionController(
      sessionId,
      createRpcSessionTransport(client),
      limit,
    ),
    consumers: 0,
  };
  bySession.set(sessionId, created);
  return created;
}

/**
 * Open one session journal over an injected gateway client.
 *
 * The controller is shared with every other consumer of the same client and
 * session. The stream opens when the first consumer mounts and closes when the
 * last one unmounts.
 *
 * @param sessionId - durable session to follow.
 * @param rpc - gateway client instance or lazy provider.
 * @param limit - optional opening-window size (honored by the first consumer).
 */
export function useSessionJournal(
  sessionId: string,
  rpc: SessionJournalRpc,
  limit?: number,
): SessionJournalBinding {
  const client = resolveRpc(rpc);
  const shared = useMemo(
    () => getSharedJournal(client, sessionId, limit),
    [client, sessionId, limit],
  );
  const controller = shared.controller;

  const subscribe = useMemo(
    () => controller.subscribe.bind(controller),
    [controller],
  );
  const getSnapshot = useMemo(
    () => controller.getSnapshot.bind(controller),
    [controller],
  );

  useEffect(() => {
    shared.consumers += 1;
    controller.open();
    return () => {
      shared.consumers -= 1;
      // Only the final consumer tears the follow stream down; the controller
      // stays cached so a remount resumes the same window.
      if (shared.consumers <= 0) {
        shared.consumers = 0;
        controller.close();
      }
    };
  }, [controller, shared]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { snapshot, controller };
}

/**
 * Bind one gateway client to the journal hook expected by
 * `configureClientSession`. The returned hook has the exact
 * `(sessionId) => binding` shape.
 * @param options - gateway client (or provider) and optional window size.
 */
export function createSessionJournalHook(
  options: SessionJournalHookOptions,
): SessionJournalHook {
  return function useBoundSessionJournal(
    sessionId: string,
  ): SessionJournalBinding {
    return useSessionJournal(sessionId, options.rpc, options.limit);
  };
}
