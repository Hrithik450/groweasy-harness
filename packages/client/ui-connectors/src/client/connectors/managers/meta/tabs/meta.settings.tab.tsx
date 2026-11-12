"use client";

import { MetaUserInfo } from "../types";
import { MetaPermissions } from "../meta.permissions";
import { Connector } from "../../../../lib/registry";
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

  const permissions: string[] = Array.isArray(connector.permissions)
    ? connector.permissions
    : Array.isArray(metadata.permissions)
      ? metadata.permissions
      : [];

  return (
    <div className="space-y-3">
      {/* 1. Authorized User & Business Details */}
      <MetaBusinessDetails
        userName={userInfo.userName}
        userId={userInfo.userId}
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
