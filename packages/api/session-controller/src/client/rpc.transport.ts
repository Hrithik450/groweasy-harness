/**
 * Gateway-backed {@link SessionJournalTransport}.
 *
 * The RPC client owns reconnection and resume; this adapter only maps the
 * `session.follow` channel and the `session.page` method onto the controller's
 * transport contract.
 *
 * @module @openai-harness/session-controller/client
 */

import type { RpcClient, RpcSubscription } from "@openai-harness/client-rpc";
import type {
  SessionAssistantStreamFrame,
  SessionFollowFrame,
  SessionPage,
  SessionPageRequest,
} from "@openai-harness/sdk-protocol";
import type {
  SessionJournalPage,
  SessionJournalTransport,
} from "./session.controller";

/** Structural subset of {@link RpcClient} the transport depends on. */
export interface RpcSessionClient {
  subscribe(
    channel: "session.follow",
    params: {
      sessionId: string;
      afterSeq?: number;
      maxMessages?: number;
    },
    onEvent: (frame: SessionFollowFrame) => void,
  ): Promise<RpcSubscription>;
  call(
    method: "session.page",
    params: SessionPageRequest,
  ): Promise<SessionPage>;
}

/** Build the journal transport over one RPC client. */
export function createRpcSessionTransport(
  client: RpcClient | RpcSessionClient,
): SessionJournalTransport {
  const rpc = client as RpcSessionClient;

  return {
    subscribe({
      sessionId,
      afterSeq,
      limit,
      onDelivery,
      onAssistantFrame,
      onError,
    }) {
      let closed = false;
      let subscription: RpcSubscription | undefined;

      rpc
        .subscribe(
          "session.follow",
          {
            sessionId,
            ...(afterSeq !== undefined ? { afterSeq } : {}),
            ...(limit !== undefined ? { maxMessages: limit } : {}),
          },
          (frame) => {
            if (closed) return;
            switch (frame.type) {
              case "snapshot":
                onDelivery({
                  events: frame.records.map((record) => record.event),
                  initial: true,
                  hasMore: frame.hasMore,
                  ...(frame.assistantStream !== undefined
                    ? { assistantStream: frame.assistantStream }
                    : {}),
                });
                return;
              case "event":
                onDelivery({
                  events: [frame.event],
                  initial: false,
                  hasMore: false,
                });
                return;
              case "assistant-stream":
                onAssistantFrame?.(frame.frame as SessionAssistantStreamFrame);
                return;
            }
          },
        )
        .then((created) => {
          if (closed) created.close();
          else subscription = created;
        })
        .catch((error: unknown) => {
          if (!closed) onError?.(error);
        });

      return () => {
        closed = true;
        subscription?.close();
      };
    },

    async loadOlder({ sessionId, beforeSeq, limit }) {
      const page = await rpc.call("session.page", {
        sessionId,
        ...(beforeSeq !== undefined ? { beforeSeq } : {}),
        ...(limit !== undefined ? { maxMessages: limit } : {}),
      });
      return {
        events: page.records.map((record) => record.event),
        hasMore: page.hasMore,
      } satisfies SessionJournalPage;
    },
  };
}
