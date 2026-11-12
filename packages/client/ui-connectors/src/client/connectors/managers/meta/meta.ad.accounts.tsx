"use client";

import React, { useState } from "react";
import { Copy, CheckCheck, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { MetaConnectedAdAccount } from "./types";

interface MetaAdAccountsProps {
  accounts: MetaConnectedAdAccount[];
  defaultCurrency?: string;
  defaultTimezone?: string;
  copiedKey?: string | null;
  onCopy?: (text: string, label: string) => void;
}

export function MetaAdAccounts({
  accounts,
  defaultCurrency = "INR",
  defaultTimezone = "Asia/Kolkata",
  copiedKey: externalCopiedKey,
  onCopy: externalOnCopy,
}: MetaAdAccountsProps) {
  const [internalCopiedKey, setInternalCopiedKey] = useState<string | null>(null);
  const activeCopiedKey = externalCopiedKey ?? internalCopiedKey;

  const handleCopy = (text: string, label: string) => {
    if (externalOnCopy) {
      externalOnCopy(text, label);
    } else {
      navigator.clipboard.writeText(text);
      setInternalCopiedKey(label);
      toast.success(`Copied ${label} to clipboard`);
      setTimeout(() => setInternalCopiedKey(null), 2000);
    }
  };

  if (!accounts || accounts.length === 0) {
    return (
      <div className="bg-muted border border-border rounded-none p-3.5 space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Connected Ad Accounts
            </span>
            <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-card border border-border">
              0 Accounts
            </span>
          </div>
        </div>

        <div className="bg-card p-4 rounded-none border border-border text-center space-y-2">
          <AlertCircle className="w-5 h-5 text-warning mx-auto" />
          <h5 className="text-sm font-semibold text-foreground">
            No Active Ad Accounts Found
          </h5>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            No advertising accounts were found for your Meta login. Please ensure your Facebook user has access to an ad account in Meta Ads Manager.
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
      </div>
    );
  }

  return (
    <div className="bg-muted border border-border rounded-none p-3 space-y-2">
      <div className="flex items-center justify-between pb-1.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Connected Ad Accounts
          </span>
          <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-card border border-border">
            {accounts.length} {accounts.length === 1 ? "Account" : "Accounts"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-0.5">
        {accounts.map((account, idx) => (
          <div
            key={account.id || idx}
            className="bg-card p-2.5 sm:p-3 rounded-none border border-border space-y-2 w-full"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground font-medium block truncate">
                  {account.name || `Ad Account ${idx + 1}`}
                </span>
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {account.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(account.id, "Ad Account ID")}
                    className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                    title="Copy Ad Account ID"
                  >
                    {activeCopiedKey === "Ad Account ID" ? (
                      <CheckCheck className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <span className="px-2 py-0.5 rounded-none text-[11px] font-semibold bg-secondary text-foreground border border-border">
                  {account.currency || defaultCurrency}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1.5 border-t border-border">
              <span className="truncate">
                Timezone: {account.timezoneName || defaultTimezone}
              </span>
              <span className="text-foreground font-medium shrink-0">
                Active
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
