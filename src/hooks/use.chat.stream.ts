import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useChatStore } from "@/store/chat.store";
import { useIsStreaming } from "@/store/selectors";
import type { SessionPromptRequest } from "@/lib/session/prompt";
import { promptDisplayText } from "@/lib/llm/llm/message";
import {
  SESSION_JOURNAL_EVENT,
  SESSION_TRANSPORT_ERROR_EVENT,
  type SessionJournalChange,
} from "@/lib/session/journal";
import type { SessionStreamMessage } from "@/lib/session/stream";
import {
  asString,
  isRecord,
  parseJournalChange,
  parseJson,
  parseTransportError,
} from "@/lib/utils/journal";

/** Applies one journal publication to the client window and transcript. */
export function applyJournalChange(
  sessionId: string,
  change: SessionJournalChange,
): void {
  const store = useChatStore.getState();
  switch (change.type) {
    case "replace":
      store.replaceJournal(
        sessionId,
        change.page.entries,
        change.page.cursor,
        change.hasMore,
      );
      break;
    case "prepend":
      store.prependJournal(
        sessionId,
        change.page.entries,
        change.page.cursor,
        change.hasMore,
      );
      break;
    case "append":
      store.appendJournal(sessionId, change.entry);
      break;
    case "assistant-stream":
      store.applyAssistantFrame(sessionId, change.frame);
      break;
  }
}

/**
 * One raw stream message, applied to the chat state.
 *
 * Chat owns journal semantics; connectors and other consumers subscribe to the
 * same socket with their own handlers.
 */
export function handleSessionStreamMessage(
  sessionId: string,
  message: SessionStreamMessage,
): void {
  if (message.event === SESSION_TRANSPORT_ERROR_EVENT) {
    console.error(
      "[useChatStream] Transport error:",
      parseTransportError(message.data),
    );
    return;
  }
  if (message.event !== SESSION_JOURNAL_EVENT) return;

  const change = parseJournalChange(parseJson(message.data));
  if (change) applyJournalChange(sessionId, change);
}

/** Re-read the newest journal page after a (re)connect. */
export async function catchUpJournal(sessionId: string): Promise<void> {
  const page = await fetchJournalPage(sessionId);
  if (page) applyJournalChange(sessionId, page);
}

export function useChatStream() {
  const params = useParams<{ sessionId?: string }>();
  const currentSessionId = params?.sessionId;

  // Derived from the tail turn, not a separate flag.
  const isStreaming = useIsStreaming(currentSessionId ?? "");

  const stopStream = (sessionId = currentSessionId) => {
    if (!sessionId) return;

    void (async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/cancel`, {
          method: "POST",
        });
        if (!response.ok) throw new Error(await readErrorMessage(response));

        const data: unknown = await response.json().catch(() => null);
        const cancelled = isRecord(data) && data.cancelled === true;
        // The turn/end event may lag the cancel by a beat; stop the view now.
        useChatStore.getState().endStreaming(sessionId);
        useChatStore.getState().clearPending(sessionId);
        if (cancelled) toast.info("Generation stopped");
      } catch (err: unknown) {
        console.error("[useChatStream] Failed to cancel turn:", err);
      }
    })();
  };

  const sendTurn = async (request: SessionPromptRequest): Promise<void> => {
    if (!request.sessionId) {
      toast.error("No active session selected");
      return;
    }
    const sessionId = request.sessionId;

    const text = request.display
      ? promptDisplayText(request.display)
      : request.content
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("\n\n");

    useChatStore.getState().addPending(sessionId, {
      text: text,
      requestId: request.requestId,
      createdAt: Date.now(),
    });

    let response: Response;
    try {
      response = await fetch(`/api/sessions/${sessionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    } catch (err: unknown) {
      useChatStore.getState().removePending(sessionId, request.requestId);
      const message = err instanceof Error ? err.message : String(err);
      console.error("[useChatStream] Turn request failed:", message);
      toast.error(message || "Could not reach the server.");
      throw err;
    }

    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      useChatStore.getState().removePending(sessionId, request.requestId);
      const error = new Error(errorMessage(data, response.status));
      const code = isRecord(data) ? asString(data.code) : "";
      if (code) (error as { code?: string }).code = code;
      console.error("[useChatStream] Turn rejected:", error.message);
      toast.error(error.message);
      throw error;
    }

    if (!isRecord(data) || data.accepted !== true) {
      useChatStore.getState().removePending(sessionId, request.requestId);
      const error = new Error("The server did not accept the prompt.");
      toast.error(error.message);
      throw error;
    }
  };

  /** Loads and prepends the journal page before the loaded window. */
  const loadOlder = async (sessionId: string): Promise<void> => {
    const store = useChatStore.getState();
    const pagination = store.pagination[sessionId];
    if (
      !pagination?.hasMore ||
      pagination.isLoadingOlder ||
      pagination.cursor === null
    ) {
      return;
    }

    store.setPagination(sessionId, { isLoadingOlder: true });

    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/journal?cursor=${encodeURIComponent(
          pagination.cursor,
        )}`,
      );
      if (!response.ok) throw new Error(await readErrorMessage(response));

      const change = parseJournalChange(await response.json());
      if (change?.type !== "prepend") {
        throw new Error("Invalid journal page received");
      }
      applyJournalChange(sessionId, change);
    } catch (err: unknown) {
      console.error("[useChatStream] Failed to load older page:", err);
      useChatStore.getState().setPagination(sessionId, {
        isLoadingOlder: false,
      });
    }
  };

  return { sendTurn, stopStream, isStreaming, loadOlder };
}

async function fetchJournalPage(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionJournalChange | null> {
  try {
    const response = await fetch(
      `/api/sessions/${sessionId}/journal`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) throw new Error(await readErrorMessage(response));

    const change = parseJournalChange(await response.json());
    if (change?.type !== "replace") {
      throw new Error("Invalid journal page received");
    }
    return change;
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    if (!aborted) {
      console.warn("[useChatStream] Journal catch-up failed:", error);
    }
    return null;
  }
}

function errorMessage(data: unknown, status: number): string {
  if (isRecord(data)) {
    const message = asString(data.error) || asString(data.message);
    if (message) return message;
  }
  return `Server responded with ${status}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (isRecord(data)) {
      const message = asString(data.message) || asString(data.error);
      if (message) return message;
    }
    return JSON.stringify(data);
  } catch {
    const text = await response.text().catch(() => "");
    return text || `Server responded with ${response.status}`;
  }
}
