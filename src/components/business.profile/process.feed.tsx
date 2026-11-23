"use client";

import { useEffect, useRef, useState } from "react";
import { parseJson } from "@/lib/utils/journal";
import { toolLabel } from "@/components/tool.labels";
import { useSessionStream } from "@/hooks/use.stream";
import { SESSION_JOURNAL_EVENT } from "@/lib/session/journal";

type JournalEntry = {
  type?: string;
  data?: {
    name?: string;
    /** Server-computed label from the real arguments. */
    label?: string;
    callId?: string;
    arguments?: unknown;
    message?: { toolCallId?: string };
  };
};

function callLabel(entry: JournalEntry): string | null {
  const name = entry.data?.name;
  if (entry.type !== "tool/call" || !name) return null;
  if (typeof entry.data?.label === "string") return entry.data.label;
  const raw = entry.data?.arguments;
  const args =
    typeof raw === "string"
      ? (parseJson(raw) as Record<string, unknown>)
      : ((raw as Record<string, unknown>) ?? {});
  return toolLabel(
    name,
    args ?? {},
    typeof entry.data?.callId === "string" ? entry.data.callId : undefined,
  );
}

/** Live tool process for the hidden Business Profile analyzer session. */
export function BusinessProfileProcess({
  fallback,
  compact = false,
}: {
  fallback: string;
  compact?: boolean;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** Labels of tool calls still running, oldest first. */
  const running = useRef(new Map<string, string>());

  useEffect(() => {
    let alive = true;
    fetch("/api/connectors/business.profile", {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { sessionId?: string | null }) => {
        if (alive && json.sessionId) setSessionId(json.sessionId);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useSessionStream(
    sessionId ?? undefined,
    (message) => {
      if (message.event !== SESSION_JOURNAL_EVENT) return;
      const change = parseJson(message.data) as {
        type?: string;
        entry?: JournalEntry;
      } | null;
      const entry = change?.entry;
      if (change?.type !== "append" || !entry) return;

      if (entry.type === "tool/call") {
        const next = callLabel(entry);
        if (!next) return;
        const callId =
          typeof entry.data?.callId === "string" ? entry.data.callId : next;
        running.current.set(callId, next);
        setLabel(next);
        return;
      }

      if (entry.type === "tool/result") {
        const callId = entry.data?.message?.toolCallId;
        if (typeof callId === "string") running.current.delete(callId);
        // Show the tool still running, not the one that just finished.
        setLabel([...running.current.values()].at(-1) ?? null);
      }
    },
    () => {},
  );

  return (
    <p
      className={`transition-all duration-300 ${
        compact
          ? "text-[12px] text-muted-foreground leading-relaxed"
          : "text-base sm:text-[18px] leading-relaxed text-foreground font-medium"
      }`}
    >
      {label ?? fallback}
    </p>
  );
}
