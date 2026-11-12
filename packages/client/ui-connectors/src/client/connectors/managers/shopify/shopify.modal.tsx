"use client";

import { connectorsFetch } from "../../../connectors.client";
import {
  BaseManagerModalDialog,
  BaseManagerModalHeader,
  BaseManagerModalTabs,
  BaseManagerModalFooter,
} from "../base.modal";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { LogOut, Loader2 } from "lucide-react";
import type { ManagerModalProps } from "../registry";
import { ShopifyConnectHero } from "./shopify.connect.hero";
import { ShopifyProductsTab } from "./shopify.products.tab";
import { ShopifySettingsTab } from "./shopify.settings.tab";
import { parseShopifyConnector } from "../../../lib/shopify/types";
import { getShopifyPrimaryUrl } from "../../../lib/shopify/utils";
import { OAUTH_RETURN_PARAMS, removeQueryParams } from "../../../lib/utils";
import { useConnectorStore } from "@openai-harness/client-ui-session";

type ShopifyTabId = "products" | "settings";

export function ShopifyManagerModal({
  connector,
  onClose,
  onUpdate,
  onRefresh,
}: ManagerModalProps) {
  const metadata = parseShopifyConnector(connector);

  const isConnected = connector.status === "connected";
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [activeTabId, setActiveTabId] = useState<ShopifyTabId>("products");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify_connected") !== "true") return;

    // Clear the callback parameters even when the refreshed connector has no
    // usable store URL, so a stale return URL cannot keep re-triggering this.
    removeQueryParams(OAUTH_RETURN_PARAMS);

    if (!isConnected) return;

    const primaryUrl = getShopifyPrimaryUrl(connector);
    if (!primaryUrl) return;

    toast.success(
      `Shopify connected! Analyzing Business Profile for ${primaryUrl}...`,
    );

    useConnectorStore.getState().updateConnector("businessProfile", {
      syncStatus: "running",
    });

    connectorsFetch("/api/connectors/business.profile/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: primaryUrl }),
    })
      .then(async (res) => {
        if (res.ok) {
          await onRefresh?.();
        }
      })
      .catch((err) => {
        console.error("Failed to connect business profile:", err);
      });
  }, [connector, isConnected, onRefresh]);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await connectorsFetch("/api/connectors/shopify/disconnect", {
        method: "POST",
      });

      if (res.ok) {
        toast.info("Shopify store disconnected");
        onUpdate?.({
          metadata: null,
          expiresAt: null,
          permissions: null,
          status: "disconnected",
          updatedAt: new Date().toISOString(),
        });
        await onRefresh?.();
        onClose();
      } else {
        toast.error("Failed to disconnect Shopify store");
      }
    } catch {
      toast.error("Network error disconnecting");
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <BaseManagerModalDialog isOpen={true} onClose={onClose}>
      {/* Header */}
      <BaseManagerModalHeader
        connector={{
          ...connector,
          status: isConnected ? "connected" : "disconnected",
        }}
        onClose={onClose}
        subtitle={metadata?.shop ? `Store: ${metadata.shop}` : "By Shopify"}
      />

      {/* Hero / Consent View when disconnected */}
      {!isConnected && <ShopifyConnectHero />}

      {/* Connected State with Tabs */}
      {isConnected && (
        <>
          <BaseManagerModalTabs
            tabs={[
              { id: "products", label: "Products" },
              { id: "settings", label: "Settings" },
            ]}
            activeTab={activeTabId}
            onChange={(id) => setActiveTabId(id as ShopifyTabId)}
          />

          <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-card no-scrollbar">
            {activeTabId === "products" ? (
              <ShopifyProductsTab />
            ) : (
              <ShopifySettingsTab connector={connector} />
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <BaseManagerModalFooter
        leftSlot={
          isConnected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:text-destructive bg-card hover:bg-destructive-tint border border-border hover:border-destructive/25 rounded-none transition-colors disabled:opacity-40 cursor-pointer"
            >
              {isDisconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              <span>Disconnect</span>
            </button>
          ) : null
        }
        rightSlot={
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer"
          >
            {isConnected ? "Done" : "Close"}
          </button>
        }
      />
    </BaseManagerModalDialog>
  );
}
