"use client";

import { useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSessionStream } from "@/hooks/use.stream";
import { SESSION_CONNECTOR_EVENT } from "@/lib/session/journal";
import { parseJson } from "@/lib/utils/journal";
import { useConnectorStore } from "@/store/connector.store";
import type { Connector } from "@/lib/connectors/registry";
import type { ConnectorSlug } from "@/lib/db";

let pendingResync: Promise<void> | null = null;

export function ConnectorStream(): null {
  const params = useParams<{ sessionId?: string }>();

  // Mount, reconnect, and the OAuth callback can all ask together; one fetch.
  const resync = useCallback((): Promise<void> => {
    if (pendingResync) return pendingResync;

    pendingResync = fetch("/api/connectors")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.connectors) && data.connectors.length > 0) {
          useConnectorStore.getState().setConnectors(data.connectors);
        }
      })
      .catch((error) => console.error("[connectors] resync failed:", error))
      .finally(() => {
        pendingResync = null;
      });

    return pendingResync;
  }, []);

  useEffect(() => {
    resync();
  }, [resync]);

  useSessionStream(
    params?.sessionId,
    (message) => {
      if (message.event !== SESSION_CONNECTOR_EVENT) return;

      const payload = parseJson(message.data) as {
        slug?: string;
        connector?: Record<string, unknown>;
      } | null;
      if (!payload?.slug || !payload.connector) return;

      useConnectorStore
        .getState()
        .updateConnector(
          payload.slug as ConnectorSlug,
          payload.connector as Partial<Connector>,
        );
    },
    resync,
  );

  return null;
}
