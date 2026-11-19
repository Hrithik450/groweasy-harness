"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Copy,
  CheckCheck,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import type { MetaAdAccount } from "@/lib/connectors/meta.ads/types";
import { MetaAdAccountStatus } from "@/lib/connectors/meta.ads/constants";

interface MetaAdAccountsTabProps {
  adAccounts: MetaAdAccount[];
  onSelectAccount: (account: MetaAdAccount) => void;
}

export function MetaAdAccountsTab({
  adAccounts,
  onSelectAccount,
}: MetaAdAccountsTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("Ad Account ID copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Strictly render empty state card when 0 ad accounts are present
  if (!adAccounts || adAccounts.length === 0) {
    return (
      <div className="bg-linen border border-border/80 rounded-2xl p-6 space-y-3 shadow-2xs text-center">
        <AlertCircle className="w-6 h-6 text-warning-strong mx-auto" />
        <h4 className="text-sm font-semibold text-foreground">
          No Active Ad Accounts Found
        </h4>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          No advertising accounts were found for your Meta login. Please ensure
          your Facebook account has admin or advertiser access in Meta Ads
          Manager.
        </p>
        <div className="pt-1">
          <span
            
            
            
            className="inline-flex items-center gap-1.5 text-xs text-info-strong hover:text-info-strong/75 font-semibold"
          >
            <span>Open Meta Ads Manager</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Subheader */}
      <div className="h-8 flex items-center justify-between">
        <div className="min-w-0 flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            Connected Ad Accounts
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-linen border border-border/80 shadow-2xs">
            {adAccounts.length}{" "}
            {adAccounts.length === 1 ? "Account" : "Accounts"}
          </span>
        </div>

        <span className="shrink-0 text-xs text-muted-2 hidden sm:inline">
          Click an account to manage campaigns &amp; creatives
        </span>
      </div>

      {/* Array of Ad Accounts List */}
      <div className="flex flex-col gap-2.5">
        {adAccounts.map((account, idx) => (
          <div
            key={account.id || idx}
            onClick={() => onSelectAccount(account)}
            className="bg-card hover:bg-linen/70 border border-border/90 hover:border-border-strong rounded-2xl p-4 shadow-2xs transition-all cursor-pointer group flex items-center justify-between gap-4"
          >
            {/* Account Details */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-foreground group-hover:text-foreground tracking-tight truncate">
                  {account.name || `Ad Account ${idx + 1}`}
                </h4>

                {account.currency && (
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-muted text-foreground border border-border/80 shrink-0">
                    {account.currency}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <span className="font-mono text-[11.5px] text-muted-foreground truncate">
                  {account.id}
                </span>
                <button
                  type="button"
                  onClick={(e) =>
                    handleCopyId(e, account.accountId ?? account.id)
                  }
                  className="text-muted-2 hover:text-foreground cursor-pointer shrink-0 p-0.5"
                  title="Copy Account ID"
                >
                  {copiedId === (account.accountId ?? account.id) ? (
                    <CheckCheck className="w-3.5 h-3.5 text-success-strong" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {account.timezoneName && (
                  <span className="text-muted-2 truncate hidden xs:inline">
                    · {account.timezoneName}
                  </span>
                )}
              </div>
            </div>

            {/* Right Affordance */}
            <div className="flex items-center gap-3 shrink-0">
              {account.accountStatus !== undefined && (
                <span
                  className={`text-[11px] font-medium px-2.5 py-0.5 rounded-none border ${
                    account.accountStatus === MetaAdAccountStatus.ACTIVE
                      ? "text-foreground bg-muted border-border/80"
                      : "text-warning bg-warning-tint border-warning-border/70"
                  }`}
                >
                  {account.accountStatus === MetaAdAccountStatus.ACTIVE
                    ? "Active"
                    : "Inactive"}
                </span>
              )}

              <div className="w-8 h-8 rounded-xl bg-muted group-hover:bg-forest text-muted-2 group-hover:text-primary-foreground flex items-center justify-center transition-all shadow-2xs">
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
