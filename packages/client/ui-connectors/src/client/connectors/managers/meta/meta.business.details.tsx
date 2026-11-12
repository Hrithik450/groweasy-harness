"use client";

import React, { useState } from "react";
import { Copy, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface MetaBusinessDetailsProps {
  userName: string;
  userId?: string;
  businessName?: string;
  businessId?: string;
  copiedKey?: string | null;
  onCopy?: (text: string, label: string) => void;
}

export function MetaBusinessDetails({
  userName,
  userId,
  businessName,
  businessId,
  copiedKey: externalCopiedKey,
  onCopy: externalOnCopy,
}: MetaBusinessDetailsProps) {
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

  const hasBusiness = Boolean(businessName || businessId);

  return (
    <div className="bg-muted border border-border rounded-none p-3 space-y-2">
      <div className="flex items-center justify-between pb-1.5 border-b border-border">
        <span className="text-sm font-semibold text-foreground">
          Authorized Business Details
        </span>
        <span className="text-[11px] text-foreground font-medium px-2 py-0.5 rounded-none bg-card border border-border">
          Meta Graph v19.0
        </span>
      </div>

      <div className="space-y-2.5 pt-0.5">
        {/* User Details */}
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground truncate">
              {userName || "Connected User"}
            </span>
            {userId ? (
              <button
                type="button"
                onClick={() => handleCopy(userId, "User ID")}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5 transition-colors"
                title="Copy User ID"
              >
                {activeCopiedKey === "User ID" ? (
                  <CheckCheck className="w-3.5 h-3.5 text-success" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground block mt-0.5 truncate">
            {userId ? `ID: ${userId}` : "Connected via Facebook Login"}
          </span>
        </div>

        {/* Business Details (aligned vertically instead of horizontally if present) */}
        {hasBusiness && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground truncate">
                {businessName || "Meta Business Account"}
              </span>
              {businessId ? (
                <button
                  type="button"
                  onClick={() => handleCopy(businessId, "Business ID")}
                  className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5 transition-colors"
                  title="Copy Business ID"
                >
                  {activeCopiedKey === "Business ID" ? (
                    <CheckCheck className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground block mt-0.5 truncate">
              {businessId ? `ID: ${businessId}` : "Verified Organization"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
