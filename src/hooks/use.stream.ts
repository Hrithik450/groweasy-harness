"use client";

/**
 * React binding for the session event stream.
 *
 * Every consumer of the same session shares one socket; the handler receives
 * raw named events and decides what they mean.
 *
 * @module @/hooks/use.stream
 */

import {
  subscribeSessionStream,
  type SessionStreamMessage,
} from "@/lib/session/stream";
import { useEffect, useRef } from "react";

export function useSessionStream(
  sessionId: string | undefined,
  onMessage: (message: SessionStreamMessage) => void,
  onReconnect: () => void,
): void {
  const handlerRef = useRef(onMessage);
  const reconnectRef = useRef(onReconnect);
  handlerRef.current = onMessage;
  reconnectRef.current = onReconnect;

  useEffect(() => {
    if (!sessionId) return;
    return subscribeSessionStream(
      sessionId,
      (message) => handlerRef.current(message),
      () => reconnectRef.current(),
    );
  }, [sessionId]);
}
