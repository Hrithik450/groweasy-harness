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
import type { MetaAdAccount } from "../../../../lib/meta/types";
import { MetaAdAccountStatus } from "../../../../lib/meta/constants";
import { MetaConnectHero } from "../meta.connect.hero";

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

  if (!adAccounts || adAccounts.length === 0) {
    return (
      <div className="bg-muted border border-border rounded-none p-6 space-y-3 text-center">
        <AlertCircle className="w-6 h-6 text-warning mx-auto" />
        <h4 className="text-sm font-semibold text-foreground">
          No Active Ad Accounts Found
        </h4>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          No advertising accounts were found for your Meta login. Please ensure
          your Facebook account has admin or advertiser access in Meta Ads
          Manager.
        </p>
        <div className="pt-1">
          <a
            href="https://adsmanager.facebook.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-info hover:text-info font-semibold"
          >
            <span>Open Meta Ads Manager</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Subheader */}
      <div className="h-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Connected Ad Accounts
          </span>
          <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-muted border border-border">
            {adAccounts.length}{" "}
            {adAccounts.length === 1 ? "Account" : "Accounts"}
          </span>
        </div>

        <span className="text-xs text-muted-foreground hidden sm:inline">
          Click an account to manage campaigns &amp; creatives
        </span>
      </div>

      {/* Array of Ad Accounts List */}
      <div className="flex flex-col gap-2.5">
        {adAccounts.map((account, idx) => (
          <div
            key={account.id || idx}
            onClick={() => onSelectAccount(account)}
            className="bg-card hover:bg-muted border border-border hover:border-input rounded-none p-4 transition-all cursor-pointer group flex items-center justify-between gap-4"
          >
            {/* Account Details */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-foreground group-hover:text-foreground tracking-tight truncate">
                  {account.name || `Ad Account ${idx + 1}`}
                </h4>

                {account.currency && (
                  <span className="px-2 py-0.5 rounded-none text-[10.5px] font-semibold bg-secondary text-foreground border border-border shrink-0">
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
                  onClick={(e) => handleCopyId(e, account.accountId)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0 p-0.5"
                  title="Copy Account ID"
                >
                  {copiedId === account.accountId ? (
                    <CheckCheck className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {account.timezoneName && (
                  <span className="text-muted-foreground truncate hidden xs:inline">
                    {account.timezoneName}
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
                      ? "text-foreground bg-secondary border-border"
                      : "text-warning bg-warning-tint border-warning/30"
                  }`}
                >
                  {account.accountStatus === MetaAdAccountStatus.ACTIVE
                    ? "Active"
                    : "Inactive"}
                </span>
              )}

              <div className="w-8 h-8 rounded-none bg-secondary group-hover:bg-brand text-muted-foreground group-hover:text-primary-foreground flex items-center justify-center transition-all">
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
