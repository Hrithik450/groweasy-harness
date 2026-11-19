"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useSessionStream } from "@/hooks/use.stream";
import { SESSION_CONNECTOR_EVENT } from "@/lib/session/journal";
import { parseJson } from "@/lib/utils/journal";
import { useConnectorStore } from "@/store/connector.store";
import { OAUTH_RETURN_PARAMS } from "@/lib/utils/utils";
import type { Connector } from "@/lib/connectors/registry";
import type { ConnectorSlug } from "@/lib/db";

/**
 * Connector updates riding the session stream.
 *
 * Headless: the session socket is shared, and each consumer interprets the
 * events it owns. Connectors belong to the user, so whichever session is open
 * delivers them to the store.
 */
export function ConnectorStream(): null {
  const params = useParams<{ sessionId?: string }>();

  const resync = useCallback((): void => {
    fetch("/api/connectors")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.connectors) && data.connectors.length > 0) {
          useConnectorStore.getState().setConnectors(data.connectors);
        }
      })
      .catch((error) => console.error("[connectors] resync failed:", error));
  }, []);

  // Connectors have no server-rendered seed, so the first sync is explicit.
  useEffect(() => {
    resync();
  }, [resync]);

  // The Meta callback returns with `meta_connected=true`. Consume it once the
  // connector state lands, then strip the OAuth params from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta_connected") !== "true") return;

    let settled = false;
    const isConnected = () =>
      useConnectorStore.getState().connectors.metaAds?.status === "connected";

    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;

      const url = new URL(window.location.href);
      for (const name of OAUTH_RETURN_PARAMS) url.searchParams.delete(name);
      const query = url.searchParams.toString();
      // Facebook returns `#_=_`; it is OAuth noise, not app state.
      const hash = /^[#_=]+$/.test(url.hash) ? "" : url.hash;
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${query ? `?${query}` : ""}${hash}`,
      );

      if (connected) toast.success("Meta Ads connected");
      else toast.error("Meta connection could not be confirmed");
      resync();
    };

    if (isConnected()) {
      finish(true);
      return;
    }

    const poll = window.setInterval(() => {
      if (!isConnected()) return;
      window.clearInterval(poll);
      finish(true);
    }, 400);
    const timeout = window.setTimeout(() => {
      window.clearInterval(poll);
      finish(isConnected());
    }, 10_000);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
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
