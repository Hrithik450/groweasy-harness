"use client";

import { connectorsFetch } from "../../../connectors.client";
import {
  BaseManagerModalTabs,
  BaseManagerModalDialog,
  BaseManagerModalHeader,
  BaseManagerModalFooter,
} from "../base.modal";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { LogOut, Loader2 } from "lucide-react";
import type { MetaAdAccount } from "../../../lib/meta";
import { MetaAdAccountsTab, MetaSettingsTab } from "./tabs";
import { MetaAdAccountModal } from "./sub/meta.ad.account.modal";
import { MetaTabId, MetaManageModalProps } from "./types";
import { MetaConnectHero } from "./meta.connect.hero";
import { OAUTH_RETURN_PARAMS, removeQueryParams } from "../../../lib/utils";

export function MetaAdsManagerModal({
  connector,
  onClose,
  onUpdate,
  onRefresh,
}: MetaManageModalProps) {
  const metadata = (connector.metadata as Record<string, unknown>) || {};

  const adAccounts: MetaAdAccount[] = Array.isArray(metadata.adAccounts)
    ? metadata.adAccounts
    : [];

  const [activeTabId, setActiveTabId] = useState<MetaTabId>("adAccounts");
  const [selectedAdAccount, setSelectedAdAccount] =
    useState<MetaAdAccount | null>(null);

  const isConnected = connector.status === "connected";
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  // React may invoke an effect twice (StrictMode) or re-run it when the
  // refreshed status flips; the post-connect toast and activation must happen
  // exactly once per OAuth return.
  const handledReturnRef = useRef(false);

  useEffect(() => {
    if (handledReturnRef.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("meta_connected") !== "true") return;
    handledReturnRef.current = true;

    // Clear the callback parameters even when the refresh left this connector
    // unusable: a stale URL would re-trigger the return on every visit.
    removeQueryParams(OAUTH_RETURN_PARAMS);

    // Only announce and activate a connection the refreshed record confirms.
    if (!isConnected) return;

    toast.success("Meta Ads connected! Running initial diagnostic audit...");

    connectorsFetch("/api/connectors/meta/connect", {
      method: "POST",
    }).catch((err) => {
      console.error("Failed to activate Meta cron jobs:", err);
    });
  }, [isConnected]);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await connectorsFetch("/api/connectors/meta/disconnect", {
        method: "POST",
      });

      if (res.ok) {
        toast.info("Meta Ads Manager disconnected");
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
        toast.error("Failed to disconnect connector");
      }
    } catch {
      toast.error("Network error disconnecting");
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <>
      <BaseManagerModalDialog isOpen={true} onClose={onClose}>
        {/* Header */}
        <BaseManagerModalHeader
          connector={{
            ...connector,
            status: isConnected ? "connected" : "disconnected",
          }}
          onClose={onClose}
        />

        {!isConnected && <MetaConnectHero />}

        {isConnected && (
          <>
            <BaseManagerModalTabs
              tabs={[
                { id: "adAccounts", label: "Ad Accounts" },
                { id: "settings", label: "Settings" },
              ]}
              activeTab={activeTabId}
              onChange={(id) => setActiveTabId(id as MetaTabId)}
            />

            {/* Content Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-3 bg-card flex-1 no-scrollbar">
              {activeTabId === "adAccounts" ? (
                <MetaAdAccountsTab
                  adAccounts={adAccounts}
                  onSelectAccount={setSelectedAdAccount}
                />
              ) : (
                <MetaSettingsTab connector={connector} />
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

      {isConnected && selectedAdAccount && (
        <MetaAdAccountModal
          account={selectedAdAccount}
          onClose={() => setSelectedAdAccount(null)}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
