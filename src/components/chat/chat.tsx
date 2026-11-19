"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import {
  catchUpJournal,
  applyJournalChange,
  handleSessionStreamMessage,
  useChatStream,
} from "@/hooks/use.chat.stream";
import { useSessionStream } from "@/hooks/use.stream";
import { usePromptSubmit } from "@/hooks/use.prompt.submit";
import { useChatStore, type PendingPrompt } from "@/store/chat.store";
import { useChatNodes, useIsStreaming, usePagination } from "@/store/selectors";
import type { ChatNode } from "./nodes";
import { useSessionStore } from "@/store/session.store";
import type { SessionView } from "@/lib/core/session/view";
import type { SessionJournalChange } from "@/lib/session/journal";
import type { DetailBarState } from "@/lib/detail.bar/state";
import { ChatHeader } from "./header";
import { ChatEmptyState } from "./empty";
import { chipsFor } from "@/lib/constants/session.suggestions";
import { DetailBar } from "./detail.bar";
import { TurnView, UserMarkdown } from "./turn";
import { ChatInputForm } from "./input.form";
import { ChiefThinking } from "../chief.thinking";
import { BotDollLoader } from "../bot.doll.loader";

interface MainChatProps {
  initialSession: SessionView;
  initialJournal: SessionJournalChange;
  initialDetailBar: DetailBarState;
}

/** Sliver of newly loaded history left visible above the viewport. */
const PREPEND_PEEK_PX = 20;

/** Stable empty list for sessions with nothing pending. */
const NO_PENDING: readonly PendingPrompt[] = [];

const NO_PAGINATION = {
  cursor: null,
  hasMore: false,
  isLoadingInitial: false,
  isLoadingOlder: false,
} as const;

interface TurnGroup {
  turn: number;
  nodes: ChatNode[];
}

function groupByTurn(nodes: readonly ChatNode[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  const byTurn = new Map<number, TurnGroup>();
  for (const node of nodes) {
    let group = byTurn.get(node.turn);
    if (group === undefined) {
      group = { turn: node.turn, nodes: [] };
      byTurn.set(node.turn, group);
      groups.push(group);
    }
    group.nodes.push(node);
  }
  return groups;
}

export function Chat({
  initialSession,
  initialJournal,
  initialDetailBar,
}: MainChatProps) {
  const sessionId = initialSession.id;

  const chatNodes = useChatNodes(sessionId);
  const isStreaming = useIsStreaming(sessionId);
  const { submitText } = usePromptSubmit(sessionId);
  const pagination = usePagination(sessionId) ?? NO_PAGINATION;
  const pendingPrompts = useChatStore(
    (state) => state.pending[sessionId] ?? NO_PENDING,
  );
  const turnGroups = useMemo(() => groupByTurn(chatNodes), [chatNodes]);

  const session = useSessionStore((state) =>
    state.sessions.find((s) => s.id === sessionId),
  );

  const currentSession = session ?? initialSession;

  const { stopStream, loadOlder } = useChatStream();

  const userScrolledUpRef = useRef(false);
  const isFetchingOlderRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState("");
  const [isInitialScrolled, setIsInitialScrolled] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    if (userScrolledUpRef.current || isFetchingOlderRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  useSessionStream(
    initialSession.id,
    (message) => handleSessionStreamMessage(initialSession.id, message),
    () => void catchUpJournal(initialSession.id),
  );

  useEffect(() => {
    const existing = useChatStore.getState().events[initialSession.id];
    if (!existing || existing.length === 0) {
      applyJournalChange(initialSession.id, initialJournal);
    }
  }, [initialSession.id, initialJournal]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (!isInitialScrolled) {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        setIsInitialScrolled(true);
      });
    }
  }, [sessionId, isInitialScrolled, turnGroups.length]);

  useEffect(() => {
    if (isInitialScrolled) {
      scrollToBottom(false);
    }
  }, [turnGroups, isStreaming, isInitialScrolled, scrollToBottom]);

  // Hidden-only pages add no height, so a single fetch is not enough: keep
  // going until a page renders visible content (or history ends). Used both to
  // fill a short viewport and when the reader reaches the top of a long one.
  const loadOlderPages = async (): Promise<void> => {
    for (let page = 0; page < 20; page += 1) {
      const state =
        useChatStore.getState().pagination[sessionId] ?? NO_PAGINATION;
      if (!state.hasMore || state.cursor === null) return;

      if (state.isLoadingOlder || isFetchingOlderRef.current) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        continue;
      }

      const container = scrollRef.current;
      const before = container?.scrollHeight ?? 0;

      isFetchingOlderRef.current = true;
      try {
        await loadOlder(sessionId);
      } finally {
        isFetchingOlderRef.current = false;
      }

      // Let the prepended page paint. Show only a sliver of it at the top so
      // the reader knows more arrived, then they scroll the rest themselves.
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const updated = scrollRef.current;
      const added = (updated?.scrollHeight ?? 0) - before;
      if (updated && added > 0) {
        updated.scrollTop = Math.max(0, added - PREPEND_PEEK_PX);
      }

      const after = updated?.scrollHeight ?? 0;
      const short = !updated || after <= updated.clientHeight + 8;
      // A page that grew the content rendered visible nodes; stop unless the
      // viewport is still empty.
      if (after > before && !short) return;
    }
  };

  // A short page cannot be scrolled, so "load older on scroll" would never
  // fire and history would be unreachable. Fill the viewport instead.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Let the seeded journal paint before measuring.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (cancelled) return;

      const el = scrollRef.current;
      if (!el || el.scrollHeight > el.clientHeight + 8) return;
      await loadOlderPages();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads live store state
  }, [sessionId]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    userScrolledUpRef.current = !isAtBottom;

    if (el.scrollTop <= 100 && !isFetchingOlderRef.current) {
      void loadOlderPages();
    }
  };

  const handleSendMessage = async (
    content: string,
    options?: {
      source?: import("@/lib/session/prompt").PromptSource;
      receiptIds?: readonly string[];
    },
  ) => {
    const receiptIds = options?.receiptIds ?? [];

    if (!content.trim() && receiptIds.length === 0) return;
    userScrolledUpRef.current = false;

    setInputValue("");
    await submitText(content, {
      ...(options?.source !== undefined ? { source: options.source } : {}),
      receiptIds,
    });
  };

  const handleChipClick = (chip: string) => {
    handleSendMessage(chip);
  };

  const handleFormSubmit = (
    e: React.FormEvent | React.KeyboardEvent,
    receiptIds: string[] = [],
  ) => {
    e.preventDefault();
    void handleSendMessage(inputValue, { receiptIds });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter is handled by the composer, so it can carry its attachments.
    void e;
  };

  const handleNavigation = async (targetId: string) => {
    let el = document.getElementById(targetId);
    for (let attempt = 0; !el && attempt < 5; attempt += 1) {
      if (!pagination.hasMore) break;
      await loadOlder(sessionId);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      el = document.getElementById(targetId);
    }
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground select-text">
      <div className="flex flex-col flex-1 h-full min-w-0 relative">
        <ChatHeader title={currentSession.title} />

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
            {pagination.isLoadingOlder && (
              <BotDollLoader
                variant="top-banner"
                text="Loading earlier turns"
              />
            )}

            {pagination.isLoadingInitial ? (
              <BotDollLoader variant="center" text="Loading conversation" />
            ) : turnGroups.length === 0 ? (
              <ChatEmptyState
                onSelectPrompt={handleSendMessage}
                slug={initialSession.slug}
              />
            ) : (
              <>
                {turnGroups.map((group, idx) => (
                  <TurnView
                    turn={group.turn}
                    nodes={group.nodes}
                    key={group.turn}
                    sessionId={sessionId}
                    isStreamingTurn={
                      isStreaming && idx === turnGroups.length - 1
                    }
                  />
                ))}

                {pendingPrompts.map((prompt) =>
                  prompt.text.trim() ? (
                    <div
                      key={prompt.requestId}
                      className="flex flex-col items-end gap-1.5 w-full mb-6"
                    >
                      <div className="w-fit max-w-full bg-brand text-primary-foreground px-4 py-2.5 rounded-none font-normal text-[14.5px] leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word]">
                        <UserMarkdown text={prompt.text} />
                      </div>
                    </div>
                  ) : null,
                )}

                {isStreaming && (
                  <ChiefThinking agentName={initialSession.title} />
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-4 pb-4 pt-1 sm:px-6 sm:pb-5 sm:pt-1 bg-transparent shrink-0">
          <div className="max-w-3xl mx-auto space-y-1.5 w-full">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {chipsFor(initialSession.slug).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="px-2.5 py-1 rounded-none border border-border bg-card text-muted-foreground text-[11px] font-medium hover:border-border-strong hover:text-foreground hover:bg-muted transition-all shadow-2xs cursor-pointer shrink-0 leading-tight"
                >
                  {chip}
                </button>
              ))}
            </div>

            <ChatInputForm
              inputValue={inputValue}
              setInputValue={setInputValue}
              onSubmit={handleFormSubmit}
              onKeyDown={handleKeyDown}
              isStreaming={isStreaming}
              onStop={stopStream}
              placeholder={`Ask ${initialSession.title} or request a marketing campaign...`}
            />
          </div>
        </div>
      </div>

      <DetailBar
        session={currentSession}
        isStreaming={isStreaming}
        initialData={initialDetailBar}
        handleSubmit={handleSendMessage}
        handleNavigation={handleNavigation}
      />
    </div>
  );
}
