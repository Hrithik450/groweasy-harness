"use client";

import { ShieldCheck, Check, Store, Globe, DollarSign, Calendar } from "lucide-react";
import type { Connector } from "../../../lib/registry";
import { parseShopifyConnector } from "../../../lib/shopify/types";

export interface ShopifySettingsTabProps {
  connector: Connector;
}

export function ShopifySettingsTab({ connector }: ShopifySettingsTabProps) {
  const metadata = parseShopifyConnector(connector);
  const permissions: string[] =
    Array.isArray(connector.permissions) && connector.permissions.length > 0
      ? connector.permissions
      : [];

  return (
    <div className="space-y-3">
      {/* Store Overview Details */}
      <div className="bg-muted border border-border rounded-none p-3 space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">
            Store Configuration
          </span>
          <span className="text-[11px] text-foreground font-medium px-2 py-0.5 rounded-none bg-card border border-border">
            Shopify Admin API
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 text-xs">
          <div className="p-2 sm:p-2.5 bg-card border border-border rounded-none flex items-center space-x-2.5">
            <Store className="w-4 h-4 text-brand shrink-0" />
            <div className="min-w-0">
              <span className="text-muted-foreground block text-[10px] uppercase font-medium">
                Store Name
              </span>
              <span className="font-semibold text-foreground truncate block text-xs">
                {metadata?.name || "Shopify Store"}
              </span>
            </div>
          </div>

          <div className="p-2 sm:p-2.5 bg-card border border-border rounded-none flex items-center space-x-2.5">
            <Globe className="w-4 h-4 text-brand shrink-0" />
            <div className="min-w-0">
              <span className="text-muted-foreground block text-[10px] uppercase font-medium">
                Domain
              </span>
              <span className="font-semibold text-foreground truncate block text-xs">
                {metadata?.shop || "myshopify.com"}
              </span>
            </div>
          </div>

          <div className="p-2 sm:p-2.5 bg-card border border-border rounded-none flex items-center space-x-2.5">
            <DollarSign className="w-4 h-4 text-brand shrink-0" />
            <div className="min-w-0">
              <span className="text-muted-foreground block text-[10px] uppercase font-medium">
                Currency
              </span>
              <span className="font-semibold text-foreground truncate block text-xs">
                {metadata?.currencyCode || "USD"}
              </span>
            </div>
          </div>

          <div className="p-2 sm:p-2.5 bg-card border border-border rounded-none flex items-center space-x-2.5">
            <Calendar className="w-4 h-4 text-brand shrink-0" />
            <div className="min-w-0">
              <span className="text-muted-foreground block text-[10px] uppercase font-medium">
                Connected Since
              </span>
              <span className="font-semibold text-foreground truncate block text-xs">
                {metadata?.connectedAt
                  ? new Date(metadata.connectedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Active"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Enabled Permissions */}
      {permissions.length > 0 && (
        <div className="bg-muted border border-border rounded-none p-3 space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand" />
              Granted Scopes &amp; Permissions
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {permissions.map((perm) => (
              <span
                key={perm}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-none text-xs font-medium bg-card border border-border text-foreground"
              >
                <Check className="w-3.5 h-3.5 text-brand" />
                <span className="font-mono text-[11px]">{perm}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
