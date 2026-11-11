"use client";

/**
 * Conversation area.
 *
 * The app's chat surface, unchanged in markup and behaviour. It owns the
 * scroll/streaming policy and the transcript fold; header, empty state,
 * composer, turn/message nodes, avatar, loader, and thinking row are child
 * seats. The root wrapper is reduced to the content column the layout frame
 * already supplies, so the conversation fits `main` instead of owning the
 * viewport.
 *
 * All state comes from `@openai-harness/client-ui-session`; the projection
 * comes from `@openai-harness/session-projection`; RPC goes through the
 * session layer's `resolveRpcClient`.
 *
 * @module @openai-harness/client-ui-chat/client/ConversationView
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import {
  useChatStream,
  useSessionStore,
} from "@openai-harness/client-ui-session";
import type { UIBlockSpec } from "@openai-harness/generative-ui";
import type { SurfaceItem } from "@openai-harness/session-projection";
import {
  foldEventsToTurns,
  withAssistantStream,
  withOptimisticPrompts,
} from "@openai-harness/session-projection";
import { TurnNode } from "./TurnNode";
import type {
  AvatarOwnerProps,
  ChatNodeOwnerProps,
  ConversationViewProps,
  LoaderOwnerProps,
  ThinkingOwnerProps,
} from "./types";

/**
 * Render the conversation area and its seats.
 * @param props - the bound child-slot renderer and host config.
 * @returns the scrollable transcript plus the composer.
 */
export function ConversationView({
  renderSlot,
  config,
}: ConversationViewProps) {
  const { sessionId, initialSession, attachmentsUploadUrl } = config;

  const {
    journal,
    journalController,
    optimistic,
    isStreaming,
    sendTurn,
    submitBlock,
    stopStream,
  } = useChatStream(sessionId);

  const session = useSessionStore((state) =>
    state.sessions.find((candidate) => candidate.id === sessionId),
  );

  const journalTurns = useMemo(
    () => foldEventsToTurns(journal.window.events, { sessionId }),
    // The window mutates in place, so revision is the change signal.
    [journal.window.revision, sessionId],
  );

  const turns = useMemo(
    () =>
      withAssistantStream(
        withOptimisticPrompts(journalTurns, optimistic, sessionId),
        journal.assistantStream,
      ),
    [journalTurns, optimistic, journal.assistantStream, sessionId],
  );

  // The session store row is the identity source; the right-hand bar reads the
  // committed `detailBar` projection directly and no session field carries it.
  const baseSession = session ?? initialSession;
  const currentSession = baseSession;
  const title = currentSession?.title || "Ad Specialist";

  const [isInitialScrolled, setIsInitialScrolled] = useState(false);
  const isSubmittingRef = useRef(false);
  const userScrolledUpRef = useRef(false);
  const isFetchingOlderRef = useRef(false);
  const isActionCompletingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    if (userScrolledUpRef.current || isFetchingOlderRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (!isInitialScrolled) {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        setIsInitialScrolled(true);
      });
    }
  }, [sessionId, isInitialScrolled, turns.length]);

  useEffect(() => {
    if (isInitialScrolled) {
      scrollToBottom(false);
    }
  }, [turns, isStreaming, isInitialScrolled, scrollToBottom]);

  const loadOlderMessages = async () => {
    if (
      !journal.window.hasMore ||
      journal.loadingOlder ||
      isFetchingOlderRef.current
    ) {
      return;
    }

    const scrollContainer = scrollRef.current;
    const previousScrollHeight = scrollContainer?.scrollHeight ?? 0;
    const previousScrollTop = scrollContainer?.scrollTop ?? 0;

    isFetchingOlderRef.current = true;
    try {
      await journalController.loadOlder();
      // The journal commit re-renders the transcript; adjust scroll after paint.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollContainer) {
            scrollContainer.scrollTop =
              previousScrollTop +
              (scrollContainer.scrollHeight - previousScrollHeight);
          }
        });
      });
    } catch (error) {
      console.error("Failed to load older turns:", error);
    } finally {
      isFetchingOlderRef.current = false;
    }
  };

  /**
   * "Jump to chat" from a detail-bar card.
   *
   * Cards saved by tools carry the assistant message id of the turn that
   * produced them; the producing turn anchors it in `data-message-ids`. The
   * target may sit in an older page, so the handler keeps loading history,
   * capped to a few pages, before giving up.
   */
  const jumpHandlerRef = useRef<(messageId: string) => Promise<void>>(
    async () => {},
  );
  jumpHandlerRef.current = async (messageId: string) => {
    const findAnchor = (): HTMLElement | null => {
      const escaped = messageId.replace(/["\\]/g, "\\$&");
      return (
        scrollRef.current?.querySelector<HTMLElement>(
          `[data-message-ids~="${escaped}"]`,
        ) ?? null
      );
    };

    let anchor = findAnchor();
    for (let attempt = 0; anchor === null && attempt < 5; attempt += 1) {
      if (!journal.window.hasMore) break;
      await loadOlderMessages();
      anchor = findAnchor();
    }
    if (anchor === null) return;

    // A jump is a deliberate move away from the live tail; leave it alone
    // until the reader scrolls back down.
    userScrolledUpRef.current = true;
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    const listener = (event: Event): void => {
      const messageId = (
        event as CustomEvent<{ messageId?: string }>
      ).detail?.messageId;
      if (messageId) void jumpHandlerRef.current(messageId);
    };
    window.addEventListener("chat:jump-to-message", listener);
    return () => window.removeEventListener("chat:jump-to-message", listener);
  }, []);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    userScrolledUpRef.current = !isAtBottom;

    if (el.scrollTop <= 100 && !isFetchingOlderRef.current) {
      loadOlderMessages();
    }
  };

  const handleSendMessage = async (
    content: string,
    options?: { hidden?: boolean; isHidden?: boolean },
  ) => {
    if (!content.trim() || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    userScrolledUpRef.current = false;

    try {
      await sendTurn(
        {
          input: content,
          hidden: options?.hidden || options?.isHidden,
        },
        sessionId,
      );
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleActionComplete = async (
    _messageId: string,
    blockId: string,
    updatedUI: UIBlockSpec,
  ) => {
    if (isActionCompletingRef.current) return;
    isActionCompletingRef.current = true;

    try {
      await submitBlock(sessionId, blockId, updatedUI);
    } finally {
      isActionCompletingRef.current = false;
    }
  };

  // Seats bound once per render: the closures below call the owner's
  // authorized `renderSlot`, so descendant node components can dispatch
  // their own message-level seats without declaring them again.
  const renderAvatar = (props: AvatarOwnerProps): ReactNode =>
    renderSlot(
      "conversation.avatar",
      { ...props, sessionId },
      { fallback: null },
    );

  const renderLoader = (props: LoaderOwnerProps): ReactNode =>
    renderSlot(
      "conversation.loader",
      { ...props, sessionId },
      { fallback: null },
    );

  const renderThinking = (props: ThinkingOwnerProps): ReactNode =>
    renderSlot(
      "conversation.thinking",
      { ...props, sessionId },
      { fallback: null },
    );

  const isLoadingInitial =
    journal.status === "loading" || journal.status === "closed";

  // The thinking row fills the gap between the prompt and the first visible
  // answer. It hides at the first answer token, not at the first assistant
  // frame: a step that only calls a tool (or renders a UI block) is still work
  // in progress, and dropping the row there leaves the turn looking finished
  // while the model keeps generating.
  const lastTurn = turns[turns.length - 1];
  const hasAnswerText =
    lastTurn?.finalAnswer?.content.some(
      (block) => block.type === "text" && block.text.trim().length > 0,
    ) ?? false;
  // A settled last turn means the next one has not started yet — the submit
  // is admitted but its first event has not arrived. That gap is work too
  // (a typed prompt or a UI-block submission), so the row shows at once
  // instead of waiting for `turn/start` to replace the finished turn.
  const awaitingTurn = lastTurn === undefined || lastTurn.status !== "running";
  // `withAssistantStream` only merges non-empty live text, so empty `text`
  // means the open step started but has emitted nothing yet. Between steps
  // (tool call, long wait) an earlier interim answer is already committed, so
  // `hasAnswerText` alone would wrongly settle the row while the turn runs.
  // Match the stream's turn too: a stale stream from an older turn says
  // nothing about this one.
  const liveText =
    journal.assistantStream !== undefined &&
    journal.assistantStream.turn === lastTurn?.turn
      ? journal.assistantStream.text.trim()
      : "";
  const showThinking =
    isStreaming &&
    (awaitingTurn ||
      !hasAnswerText ||
      (lastTurn?.status === "running" && liveText.length === 0));

  return (
    <div className="flex flex-col flex-1 h-full min-w-0 relative select-text text-foreground">
      {renderSlot("conversation.header", {
        sessionId,
        session: currentSession,
        title,
      })}

      {/* Scrollable Turn Transcript */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 w-full ${
          isInitialScrolled
            ? "opacity-100 transition-opacity duration-150"
            : "opacity-0"
        }`}
        style={{ overscrollBehavior: "contain", overflowAnchor: "auto" }}
      >
        <div className="max-w-3xl mx-auto pb-6 w-full min-w-0">
          {journal.loadingOlder &&
            renderLoader({
              variant: "top-banner",
              text: "Loading earlier turns",
            })}

          {isLoadingInitial ? (
            renderLoader({ variant: "center", text: "Loading conversation" })
          ) : turns.length === 0 ? (
            renderSlot("conversation.empty", {
              sessionId,
              title,
              onSelectPrompt: handleSendMessage,
              renderAvatar,
            })
          ) : (
            <>
              {turns.map((turn, idx) => {
                const isLast = idx === turns.length - 1;
                const isStreamingTurn = isStreaming && isLast;

                const nodeProps: ChatNodeOwnerProps = {
                  turn,
                  isStreamingTurn,
                  isLatestTurn: isLast,
                  onActionComplete: handleActionComplete,
                };

                const renderUserMessage = (
                  input: SurfaceItem,
                ): ReactNode =>
                  renderSlot(
                    "conversation.chat.node",
                    { ...nodeProps, input },
                    { entryKey: "user", fallback: null },
                  );

                const renderAssistantMessage = (
                  answer: SurfaceItem,
                ): ReactNode =>
                  renderSlot(
                    "conversation.chat.node",
                    { ...nodeProps, turn: { ...turn, finalAnswer: answer } },
                    { entryKey: "assistant", fallback: null },
                  );

                return (
                  <Fragment key={`turn-${turn.turn}`}>
                    {renderSlot(
                      "conversation.chat.node",
                      {
                        ...nodeProps,
                        renderUserMessage,
                        renderAssistantMessage,
                      },
                      {
                        entryKey: "turn",
                        fallback: (
                          <TurnNode
                            {...nodeProps}
                            renderUserMessage={renderUserMessage}
                            renderAssistantMessage={renderAssistantMessage}
                          />
                        ),
                      },
                    )}
                  </Fragment>
                );
              })}

              {showThinking &&
                renderThinking({
                  agentName: baseSession?.title,
                  className:
                    "flex items-center space-x-2.5 mb-3 pt-1.5 pb-1 px-1 w-full max-w-full transition-all duration-200",
                })}
            </>
          )}
        </div>
      </div>

      {/* Bottom Input Section */}
      {renderSlot("conversation.composer", {
        sessionId,
        title,
        isStreaming,
        onSubmit: handleSendMessage,
        onStop: stopStream,
        uploadUrl: attachmentsUploadUrl,
      })}
    </div>
  );
}
