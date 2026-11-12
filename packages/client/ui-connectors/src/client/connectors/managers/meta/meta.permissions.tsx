"use client";

import React from "react";
import { ShieldCheck, Check } from "lucide-react";

interface MetaPermissionsProps {
  permissions: string[];
}

export function MetaPermissions({ permissions }: MetaPermissionsProps) {
  if (!permissions || permissions.length === 0) {
    return null;
  }

  return (
    <div className="bg-muted border border-border rounded-none p-3 space-y-2">
      <span className="text-sm font-semibold text-foreground flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-brand" />
        Enabled Permissions
      </span>
      <div className="flex flex-wrap gap-1.5">
        {permissions.map((perm) => (
          <span
            key={perm}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-none text-xs font-medium bg-card border border-border text-foreground"
          >
            <Check className="w-3.5 h-3.5 text-brand" />
            <span>{perm}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
