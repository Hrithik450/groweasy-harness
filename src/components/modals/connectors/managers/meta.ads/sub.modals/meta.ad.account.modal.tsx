"use client";

import React, { useState } from "react";
import { ArrowLeft, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  BaseManagerModalDialog,
  BaseManagerModalFooter,
  BaseManagerModalTabs,
} from "../../base.modal";
import { Connector } from "@/lib/connectors/registry";
import type { MetaAdAccount } from "@/lib/connectors/meta.ads/types";
import { MetaAdAccountSubTabId } from "../types";
import {
  MetaCampaignsSubTab,
  MetaAdSetsSubTab,
  MetaAdsSubTab,
} from "../tabs/subtabs";

export interface MetaAdAccountModalProps {
  onClose: () => void;
  account?: MetaAdAccount;
  onUpdate?: (updates: Partial<Connector>) => void;
}

export function MetaAdAccountModal({
  onClose,
  account: propAccount,
}: MetaAdAccountModalProps) {
  const account = propAccount;
  const [activeTabId, setActiveTabId] =
    useState<MetaAdAccountSubTabId>("campaigns");

  if (!account) return null;

  const adsManagerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${(account.accountId ?? account.id)}`;


  return (
    <BaseManagerModalDialog
      isOpen={true}
      onClose={onClose}
      hideBackdrop={true}
      className="z-[60] shadow-2xl"
    >
      {/* Top Header */}
      <div className="h-[68px] flex items-center justify-between px-5 sm:px-6 border-b border-border-subtle bg-card shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-xl bg-card border border-border/80 hover:border-border-strong hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center shadow-2xs shrink-0 transition-colors cursor-pointer"
            title="Back to Ad Accounts"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h2 className="text-[13.5px] font-semibold text-foreground truncate leading-tight">
                {account.name || "Meta Ad Account"}
              </h2>

              {account.currency && (
                <span className="px-1 py-0.5 rounded-none text-[10.5px] font-semibold bg-muted text-foreground border border-border shrink-0">
                  {account.currency}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-0.5 leading-tight">
              <span className="font-mono text-[11px] truncate">
                {account.id}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-muted-2 hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer shrink-0"
          title="Close modal"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Top Level Navigations for this Ad Account */}
      <BaseManagerModalTabs
        tabs={[
          { id: "campaigns", label: "Campaigns" },
          { id: "adsets", label: "Ad Sets" },
          { id: "ads", label: "Ads" },
        ]}
        activeTab={activeTabId}
        onChange={(id) => setActiveTabId(id as MetaAdAccountSubTabId)}
      />

      {/* Content Body */}
      <div className="p-5 sm:p-6 overflow-y-auto space-y-3 bg-card flex-1 no-scrollbar">
        {activeTabId === "campaigns" && (
          <MetaCampaignsSubTab selectedAdAccountId={account.id} />
        )}
        {activeTabId === "adsets" && (
          <MetaAdSetsSubTab
            selectedAccountId={(account.accountId ?? account.id)}
            adAccountCurrency={account.currency}
          />
        )}
        {activeTabId === "ads" && (
          <MetaAdsSubTab selectedAccountId={(account.accountId ?? account.id)} />
        )}
      </div>

      {/* Footer */}
      <BaseManagerModalFooter
        leftSlot={
          <span
            
            
            
            className="min-w-0 inline-flex items-center gap-1.5 text-xs text-info-strong hover:text-info-strong font-semibold"
          >
            <span className="truncate">Open in Ads Manager</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </span>
        }
        rightSlot={
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-lg transition-colors cursor-pointer shadow-2xs"
          >
            Close
          </button>
        }
      />
    </BaseManagerModalDialog>
  );
}
