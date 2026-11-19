export * from "./base.modal";
export * from "./business.profile";
export * from "./common.modal";
export * from "./meta.ads";
export * from "./registry";
import type { ComponentType } from "react";
import type { ConnectorSlug } from "@/lib/connectors/registry";
import type { ManagerModalProps } from "./registry";
import { BaseManagerModal } from "./base.modal";
import { BusinessProfileManagerModal } from "./business.profile";
import { MetaAdsManagerModal } from "./meta.ads";
import { ShopifyManagerModal } from "./shopify/shopify.modal";

export { ShopifyManagerModal };

const MANAGER_MODALS: Record<
  ConnectorSlug,
  ComponentType<ManagerModalProps>
> = {
  shopify: ShopifyManagerModal,
  metaAds: MetaAdsManagerModal,
  businessProfile: BusinessProfileManagerModal,
};

export function getManagerModal(
  slug: ConnectorSlug,
): ComponentType<ManagerModalProps> {
  return MANAGER_MODALS[slug] ?? BaseManagerModal;
}
