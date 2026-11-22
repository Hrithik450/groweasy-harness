"use client";

import { useEffect, useState } from "react";
import { parseJson } from "@/lib/utils/journal";
import { toolLabel } from "@/components/tool.labels";
import { useSessionStream } from "@/hooks/use.stream";
import { SESSION_JOURNAL_EVENT } from "@/lib/session/journal";

type JournalEntry = {
  type?: string;
  data?: { name?: string; arguments?: unknown };
};

function entryLabel(entry: JournalEntry): string | null {
  const name = entry.data?.name;
  if (entry.type !== "tool/call" || !name) return null;
  const raw = entry.data?.arguments;
  const args =
    typeof raw === "string"
      ? (parseJson(raw) as Record<string, unknown>)
      : ((raw as Record<string, unknown>) ?? {});
  return toolLabel(name, args ?? {});
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
      if (change?.type !== "append" || !change.entry) return;
      const next = entryLabel(change.entry);
      if (next) setLabel(next);
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
