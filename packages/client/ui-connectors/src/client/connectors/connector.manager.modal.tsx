"use client";

import { useConnectorStore } from "@openai-harness/client-ui-session";
import { connectorsFetch } from "../connectors.client";
import { getManagerModal } from "./managers";

interface ConnectorManagerModalProps {
  onRefresh?: () => Promise<void> | void;
}

export function ConnectorManagerModal({ onRefresh }: ConnectorManagerModalProps) {
  const {
    activeManagerSlug,
    connectors,
    closeManager,
    updateConnector,
    setConnectors,
  } = useConnectorStore();

  const refresh =
    onRefresh ??
    (async () => {
      const res = await connectorsFetch("/api/connectors");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.connectors)) {
        setConnectors(data.connectors);
      }
    });

  if (!activeManagerSlug) return null;

  const connector = connectors.find((c) => c.slug === activeManagerSlug);
  if (!connector) return null;

  const ManagerModal = getManagerModal(connector.slug);

  return (
    <ManagerModal
      connector={connector}
      onClose={closeManager}
      onUpdate={(updates) => updateConnector(connector.slug, updates)}
      onRefresh={refresh}
    />
  );
}
