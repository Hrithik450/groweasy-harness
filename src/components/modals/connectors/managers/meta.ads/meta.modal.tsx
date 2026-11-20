"use client";

import {
  BaseManagerModalTabs,
  BaseManagerModalDialog,
  BaseManagerModalHeader,
  BaseManagerModalFooter,
} from "../base.modal";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { OAUTH_RETURN_PARAMS } from "@/lib/utils/utils";
import { LogOut, Loader2 } from "lucide-react";
import type { MetaAdAccount } from "@/lib/connectors/meta.ads/types";
import { MetaAdAccountsTab, MetaSettingsTab } from "./tabs";
import { MetaAdAccountModal } from "./sub.modals/meta.ad.account.modal";
import { MetaTabId, MetaManageModalProps } from "./types";
import { MetaConnectHero } from "./meta.connect.hero";

export function MetaAdsManagerModal({
  connector,
  onClose,
}: MetaManageModalProps) {
  const metadata = (connector.metadata as Record<string, any>) || {};

  const adAccounts: MetaAdAccount[] = Array.isArray(metadata.adAccounts)
    ? metadata.adAccounts
    : [];

  const [activeTabId, setActiveTabId] = useState<MetaTabId>("adAccounts");
  const [selectedAdAccount, setSelectedAdAccount] =
    useState<MetaAdAccount | null>(null);

  // Server-owned: the disconnect write comes back on the session stream.
  const isConnected = connector.status === "connected";
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // The OAuth return lands with `meta_connected=true`; consume it here once
  // the stream has delivered the connected connector.
  useEffect(() => {
    if (connector.status !== "connected") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta_connected") !== "true") return;

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

    toast.success("Meta Ads connected");
  }, [connector.status]);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/connectors/meta.ads/disconnect", {
        method: "POST",
      });

      if (res.ok) {
        toast.info("Meta Ads Manager disconnected");
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
        <BaseManagerModalHeader connector={connector} onClose={onClose} />

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

      {isConnected && selectedAdAccount && (
        <MetaAdAccountModal
          account={selectedAdAccount}
          onClose={() => setSelectedAdAccount(null)}
        />
      )}
    </>
  );
}
