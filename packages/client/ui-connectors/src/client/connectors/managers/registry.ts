"use client";

import React from "react";
import { MetaAdsManagerModal } from "./meta";
import { BusinessProfileManagerModal } from "./business.profile";
import { ShopifyManagerModal } from "./shopify";
import { BaseManagerModal } from "./base.modal";
import { Connector } from "../../lib/registry";
import { CONNECTOR_SLUGS } from "../../lib/constants";

type ConnectorSlug = (typeof CONNECTOR_SLUGS)[number];

export interface ManagerModalProps {
  connector: Connector;
  onClose: () => void;
  onUpdate?: (updates: Partial<Connector>) => void;
  onRefresh?: () => Promise<void> | void;
}

export const MANAGER_MODALS: Record<
  ConnectorSlug,
  React.ComponentType<ManagerModalProps>
> = {
  metaAds: MetaAdsManagerModal,
  businessProfile: BusinessProfileManagerModal,
  shopify: ShopifyManagerModal,
};

export function getManagerModal(
  connectorSlug: ConnectorSlug,
): React.ComponentType<ManagerModalProps> {
  return MANAGER_MODALS[connectorSlug] ?? BaseManagerModal;
}
