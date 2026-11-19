"use client";

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
import { parseShopifyConnector } from "@/lib/connectors/shopify/types";
import { getShopifyPrimaryUrl } from "@/lib/connectors/shopify/utils";

type ShopifyTabId = "products" | "settings";

export function ShopifyManagerModal({ connector, onClose }: ManagerModalProps) {
  const metadata = parseShopifyConnector(connector);

  const isConnected = connector.status === "connected";
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [activeTabId, setActiveTabId] = useState<ShopifyTabId>("products");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify_connected") !== "true") return;

    // 1. Guard: Wait until connector metadata actually resolves from async store
    const primaryUrl = getShopifyPrimaryUrl(connector);
    if (!primaryUrl) return;

    // 2. Consume param and clean URL
    window.history.replaceState({}, "", window.location.pathname);

    // 3. Notify and trigger Business Profile connection
    toast.success(
      `Shopify connected! Analyzing Brand Brain for ${primaryUrl}...`,
    );

    // The route marks the connector running; the stream delivers that state.
    fetch("/api/connectors/business.profile/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: primaryUrl }),
    }).catch((err) => {
      console.error("Failed to connect business profile:", err);
    });
  }, [connector]);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/connectors/shopify/disconnect", {
        method: "POST",
      });

      if (res.ok) {
        toast.info("Shopify store disconnected");
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
        connector={connector}
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
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:text-destructive bg-card hover:bg-destructive-tint/70 border border-border hover:border-destructive-border rounded-lg transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
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
            className="px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-lg transition-colors cursor-pointer shadow-2xs"
          >
            {isConnected ? "Done" : "Close"}
          </button>
        }
      />
    </BaseManagerModalDialog>
  );
}
