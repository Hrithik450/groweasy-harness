"use client";

import { getManagerModal } from "./managers";
import { useConnector, useConnectorStore } from "@/store/connector.store";

export function ConnectorManagerModal() {
  const activeManagerSlug = useConnectorStore(
    (state) => state.activeManagerSlug,
  );
  const closeManager = useConnectorStore((state) => state.closeManager);

  const connector = useConnector(activeManagerSlug);
  if (!activeManagerSlug || !connector) return null;

  const ManagerModal = getManagerModal(connector.slug);

  return <ManagerModal connector={connector} onClose={closeManager} />;
}
