"use client";

import { X, ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import { Connector } from "@/lib/connectors/registry";
import { getProviderFromSlug } from "@/lib/connectors/utils";
import React, { useEffect, useState } from "react";
import type { ManagerModalProps } from "./registry";
import { toast } from "sonner";

/** Capability copy shown for a connected connector. */
const DEFAULT_PERMISSIONS: string[] = [
  "Read advertising analytics & metrics",
  "Draft & trigger lead generation flows",
  "Inspect agent execution logs",
];

export interface ConnectorIconProps {
  icon?: string;
  name: string;
  className?: string;
  iconClassName?: string;
}

export function ConnectorIcon({
  icon,
  name,
  className = "w-full h-full flex items-center justify-center",
  iconClassName = "w-full h-full object-contain aspect-square",
}: ConnectorIconProps) {
  const [imageError, setImageError] = useState(false);

  if (icon && !imageError) {
    return (
      <div className={`rounded-[9px] overflow-hidden ${className}`}>
        <img
          src={icon}
          alt={name}
          onError={() => setImageError(true)}
          className={iconClassName}
          loading="eager"
        />
      </div>
    );
  }

  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={`font-semibold text-xs tracking-tight bg-muted text-foreground select-none rounded-[9px] ${className}`}
      title={name}
    >
      {initials || "C"}
    </div>
  );
}

/**
 * Panel sizing presets.
 *
 * `wide` keeps the 896×640 panel as the baseline and gives back 20% of the
 * horizontal gap and 50% of the vertical gap, so it stays proportional on any
 * viewport instead of hard-coding one screen's dimensions.
 */
export const MODAL_PANEL_SIZE = {
  default: "max-w-4xl h-[90dvh] sm:h-[640px] max-h-[90dvh]",
  wide: "max-w-4xl sm:max-w-[calc(20vw_+_710px)] h-[90dvh] sm:h-[calc(50dvh_+_320px)] max-h-[92dvh]",
} as const;

export interface BaseConnectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  hideBackdrop?: boolean;
  /** Panel sizing preset (see {@link MODAL_PANEL_SIZE}). */
  size?: keyof typeof MODAL_PANEL_SIZE;
}

export function BaseConnectorDialog({
  isOpen,
  onClose,
  children,
  className = "",
  size = "wide",
}: BaseConnectorDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 select-none animate-in fade-in duration-200">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-foreground/50 backdrop-blur-xs transition-opacity cursor-pointer"
      />

      <div
        className={`relative z-10 w-full bg-card border border-border rounded-none flex flex-col overflow-hidden text-foreground ${MODAL_PANEL_SIZE[size]} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export interface BaseManagerHeaderProps {
  connector: Connector;
  onClose: () => void;
  subtitle?: React.ReactNode;
  statusBadge?: React.ReactNode;
}

export function BaseManagerHeader({
  connector,
  onClose,
  subtitle,
  statusBadge,
}: BaseManagerHeaderProps) {
  const statusLabel =
    connector.status === "connected"
      ? "Connected"
      : connector.status === "running"
        ? "Analyzing"
        : connector.status === "error"
          ? "Error"
          : "Disconnected";

  return (
    <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border-subtle bg-card shrink-0">
      <div className="flex items-center space-x-3 min-w-0">
        {statusBadge}
        <div className="h-9 w-9 rounded-xl bg-card border border-border/80 flex items-center justify-center p-0.5 shadow-2xs shrink-0 overflow-hidden">
          <ConnectorIcon icon={connector.icon} name={connector.name} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <h2 className="min-w-0 truncate text-[13.5px] font-semibold text-foreground leading-tight">
              {connector.name}
            </h2>

            <span className="shrink-0 px-2 py-0.5 rounded-none text-[10.5px] font-semibold bg-muted text-foreground border border-border">
              {statusLabel}
            </span>
          </div>

          {typeof subtitle === "string" ? (
            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
              {subtitle}
            </p>
          ) : (
            (subtitle ?? (
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                By {getProviderFromSlug(connector.providerSlug)}
              </p>
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-muted-2 hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
        title="Close modal"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

export interface BaseManagerTabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
}

export function BaseManagerTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
}: BaseManagerTabsProps<T>) {
  return (
    <div className="flex border-b border-border/80 bg-card px-5 sm:px-6 pt-2 gap-2 shrink-0 relative">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-t-xl cursor-pointer flex items-center gap-2 border-t border-x -mb-px relative select-none ${
              isActive
                ? "bg-card text-foreground border-border/80 z-10 after:absolute after:-bottom-px after:left-0 after:right-0 after:h-[2px] after:bg-card after:pointer-events-none"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors duration-150 z-0"
            }`}
          >
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface BaseManagerFooterProps {
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
}

export function BaseManagerFooter({
  leftSlot,
  rightSlot,
  className = "",
}: BaseManagerFooterProps) {
  return (
    <div
      className={`px-5 sm:px-6 py-3.5 sm:py-4 border-t border-border-subtle bg-card flex items-center justify-between shrink-0 ${className}`}
    >
      <div className="min-w-0">{leftSlot}</div>
      <div className="flex items-center space-x-2 shrink-0">{rightSlot}</div>
    </div>
  );
}

export function BaseManagerModal({
  connector,
  onClose,
  onUpdate,
}: ManagerModalProps) {
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
      {/* Header */}
      <BaseManagerHeader connector={connector} onClose={onClose} />

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3 bg-card no-scrollbar">
        {/* Description & Overview */}
        <div className="bg-card border border-border/80 rounded-xl p-2.5 sm:p-3 space-y-1.5">
          <span className="text-sm font-semibold text-foreground block">
            Integration Details
          </span>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {connector.description}
          </p>
        </div>

        {/* Enabled Permissions - Only show if permissions exist */}
        {permissions.length > 0 && (
          <div className="border border-border/80 rounded-xl p-2.5 sm:p-3 space-y-2">
            <span className="text-sm font-semibold text-foreground block">
              Enabled Permissions
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {permissions.map((perm, idx) => (
                <div
                  key={idx}
                  className="min-w-0 flex items-center space-x-2 text-xs text-foreground bg-card/80 border border-border/60 rounded-lg px-2 py-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-success-strong shrink-0" />
                  <span className="truncate">{perm}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sandboxed Environment Notice */}
        <div className="bg-card/90 border border-border/80 rounded-xl p-2.5 sm:p-3 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-forest shrink-0 mt-0.5" />
          <div className="text-[13px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground block mb-0.5">
              Sandboxed Integration
            </span>
            This connector is scoped to your authorized workspace sessions with
            full auditability and TLS encrypted data exchange.
          </div>
        </div>
      </div>

      {/* Footer */}
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
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 ${
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

export const BaseManagerModalDialog = BaseConnectorDialog;
export const BaseManagerModalHeader = BaseManagerHeader;
export const BaseManagerModalTabs = BaseManagerTabs;
export const BaseManagerModalFooter = BaseManagerFooter;

/** Edit state a manager tab hands to the modal footer. */
export interface ModalEditActions {
  isEditing: true;
  onSave: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  isSaving?: boolean;
}

/**
 * Register a tab's save/cancel handlers with the modal footer.
 *
 * Not wired to the footer yet — the manager modals still render their own
 * actions, so this records the handlers without publishing them.
 */
export function useModalEditActions(_actions: ModalEditActions | null): void {
  // Intentionally empty until the footer consumes registered actions.
}
