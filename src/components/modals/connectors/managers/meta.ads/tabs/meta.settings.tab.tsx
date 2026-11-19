"use client";

import { MetaUserInfo } from "../types";
import { MetaPermissions } from "../meta.permissions";
import { Connector } from "@/lib/connectors/registry";
import { MetaBusinessDetails } from "../meta.business.details";

interface MetaSettingsTabProps {
  connector: Connector;
  copiedKey?: string | null;
  onCopy?: (text: string, label: string) => void;
}

export function MetaSettingsTab({
  connector,
  copiedKey,
  onCopy,
}: MetaSettingsTabProps) {
  const metadata = (connector.metadata as Record<string, any>) || {};

  const userInfo: MetaUserInfo = {
    userName: metadata.userName || "Meta User",
    userId: metadata.userId || "",
    businessName: metadata.businessName,
    businessId: metadata.businessId,
  };

  // Scopes are not sent to the browser; the profile carries what was granted.
  const permissions: string[] = Array.isArray(metadata.permissions)
    ? metadata.permissions
    : [];

  return (
    <div className="space-y-3">
      {/* 1. Authorized User & Business Details */}
      <MetaBusinessDetails
        userId={userInfo.userId}
        userName={userInfo.userName}
        businessName={userInfo.businessName}
        businessId={userInfo.businessId}
        copiedKey={copiedKey}
        onCopy={onCopy}
      />

      {/* 2. Granted API Permissions */}
      <MetaPermissions permissions={permissions} />
    </div>
  );
}
