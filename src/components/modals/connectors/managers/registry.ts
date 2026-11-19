"use client";

import type { Connector } from "@/lib/connectors/registry";

/** Props every connector manager modal receives. */
export interface ConnectorManagerProps {
  connector: Connector;
  onClose: () => void;
  onUpdate?: (updates: Partial<Connector>) => void;
  onRefresh?: () => Promise<void> | void;
}

export type ManagerModalProps = ConnectorManagerProps;
