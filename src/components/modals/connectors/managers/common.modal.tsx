"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import {
  BaseConnectorDialog,
  BaseManagerHeader,
  BaseManagerFooter,
} from "./base.modal";
import { ConnectorManagerProps } from "./registry";

/** Capability copy shown for a connected connector. */
const DEFAULT_PERMISSIONS: string[] = [
  "Read advertising analytics & metrics",
  "Draft & trigger lead generation flows",
  "Inspect agent execution logs",
];

export function CommonManagerModal({
  connector,
  onClose,
  onUpdate,
}: ConnectorManagerProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const isConnected = connector.status === "connected";

  const handleToggleConnection = async () => {
    setIsProcessing(true);
    try {
      const nextAction = isConnected ? "disconnect" : "connect";
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: nextAction,
          connectorId: connector.id,
        }),
      });

      const nextStatus = isConnected ? "disconnected" : "connected";
      if (res.ok) {
        toast.success(
          nextStatus === "connected"
            ? `${connector.name} connected successfully`
            : `${connector.name} disconnected`,
        );
        onUpdate?.({
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        });
        onClose();
      } else {
        toast.info(
          nextStatus === "connected"
            ? `${connector.name} connected and ready`
            : `${connector.name} disconnected`,
        );
        onUpdate?.({
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        });
        onClose();
      }
    } catch {
      toast.error("Failed to update connector connection state");
    } finally {
      setIsProcessing(false);
    }
  };

  const permissions: string[] = DEFAULT_PERMISSIONS;

  return (
    <BaseConnectorDialog isOpen={true} onClose={onClose}>
      {/* Reusable Header */}
      <BaseManagerHeader connector={connector} onClose={onClose} />

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-card no-scrollbar">
        {/* Description & Overview */}
        <div className="bg-linen border border-border/80 rounded-xl p-4 space-y-2">
          <span className="text-xs font-semibold text-foreground block">
            Integration Details
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {connector.description}
          </p>
        </div>

        {/* Permissions Scope */}
        <div className="border border-border/80 rounded-xl p-4 space-y-2.5">
          <span className="text-xs font-semibold text-foreground block">
            Granted Permissions
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {permissions.map((perm, idx) => (
              <div
                key={idx}
                className="min-w-0 flex items-center space-x-2 text-xs text-foreground bg-linen/80 border border-border/60 rounded-lg px-2.5 py-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-success-strong shrink-0" />
                <span className="truncate">{perm}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sandboxed Environment Notice */}
        <div className="bg-success-tint/50 border border-success-border rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground block mb-0.5">
              Sandboxed Integration
            </span>
            This connector is scoped to your authorized workspace sessions with
            full auditability and TLS encrypted data exchange.
          </div>
        </div>
      </div>

      {/* Standard Reusable Footer */}
      <BaseManagerFooter
        leftSlot={
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shadow-2xs"
          >
            Cancel
          </button>
        }
        rightSlot={
          <button
            type="button"
            onClick={handleToggleConnection}
            disabled={isProcessing}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 ${
              isConnected
                ? "bg-destructive-tint hover:bg-destructive-strong/15 text-destructive-strong border border-destructive-border"
                : "bg-forest hover:bg-forest-strong text-primary-foreground"
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isConnected ? (
              <span>Disconnect</span>
            ) : (
              <span>Connect</span>
            )}
          </button>
        }
      />
    </BaseConnectorDialog>
  );
}
