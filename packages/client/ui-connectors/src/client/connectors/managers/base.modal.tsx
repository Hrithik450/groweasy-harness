"use client";

import { connectorsFetch } from "../../connectors.client";
import {
  X,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  LogOut,
  Check,
} from "lucide-react";
import { Connector } from "../../lib/registry";
import { getProviderFromSlug } from "../../lib";
import React, {
  useEffect,
  useState,
  createContext,
  useContext,
  useRef,
} from "react";
import type { ManagerModalProps } from "./registry";
import { toast } from "sonner";

export interface ModalEditActions {
  isEditing: boolean;
  onSave?: () => void | Promise<void>;
  onCancel?: () => void;
  isSaving?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
}

const ModalEditStateContext = createContext<ModalEditActions | null>(null);
const ModalEditDispatchContext = createContext<
  ((actions: ModalEditActions | null) => void) | null
>(null);

export function useModalEditContext() {
  const editActions = useContext(ModalEditStateContext);
  const setEditActions = useContext(ModalEditDispatchContext);
  return { editActions, setEditActions };
}

export function useModalEditActions(actions: ModalEditActions | null) {
  const setEditActions = useContext(ModalEditDispatchContext);
  const actionsRef = useRef(actions);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const isEditing = Boolean(actions?.isEditing);
  const isSaving = Boolean(actions?.isSaving);
  const saveLabel = actions?.saveLabel;
  const cancelLabel = actions?.cancelLabel;

  const handleSave = () => {
    return actionsRef.current?.onSave?.();
  };

  const handleCancel = () => {
    actionsRef.current?.onCancel?.();
  };

  useEffect(() => {
    if (!setEditActions) return;
    if (!isEditing) {
      setEditActions(null);
      return;
    }
    setEditActions({
      isEditing: true,
      isSaving,
      onSave: handleSave,
      onCancel: handleCancel,
      saveLabel,
      cancelLabel,
    });
    return () => {
      setEditActions(null);
    };
  }, [
    setEditActions,
    isEditing,
    isSaving,
    handleSave,
    handleCancel,
    saveLabel,
    cancelLabel,
  ]);
}

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
      <div className={`rounded-none overflow-hidden ${className}`}>
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
      className={`font-semibold text-xs tracking-tight bg-secondary text-foreground select-none rounded-none ${className}`}
      title={name}
    >
      {initials || "C"}
    </div>
  );
}

/**
 * Panel sizing presets.
 *
 * `wide` keeps the default 896×640 panel as the baseline and gives back 20% of
 * the horizontal gap and 50% of the vertical gap, so it stays proportional on
 * any viewport instead of hard-coding one screen's dimensions.
 */
export const MODAL_PANEL_SIZE = {
  default: "max-w-4xl h-[90dvh] sm:h-[640px] max-h-[90dvh]",
  wide: "max-w-4xl sm:max-w-[calc(20vw_+_710px)] h-[90dvh] sm:h-[calc(50dvh_+_320px)] max-h-[92dvh]",
} as const;

export interface BaseManagerModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  hideBackdrop?: boolean;
  /** Panel sizing preset (see {@link MODAL_PANEL_SIZE}). */
  size?: keyof typeof MODAL_PANEL_SIZE;
}

export function BaseManagerModalDialog({
  isOpen,
  onClose,
  children,
  className = "",
  hideBackdrop = false,
  size = "default",
}: BaseManagerModalDialogProps) {
  const [editActions, setEditActionsState] = useState<ModalEditActions | null>(
    null,
  );

  const setEditActions = (next: ModalEditActions | null) => {
    setEditActionsState((prev) => {
      if (!prev && !next) return prev;
      if (
        prev?.isEditing === next?.isEditing &&
        prev?.isSaving === next?.isSaving &&
        prev?.saveLabel === next?.saveLabel &&
        prev?.cancelLabel === next?.cancelLabel &&
        prev?.onSave === next?.onSave &&
        prev?.onCancel === next?.onCancel
      ) {
        return prev;
      }
      return next;
    });
  };

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
    <ModalEditDispatchContext.Provider value={setEditActions}>
      <ModalEditStateContext.Provider value={editActions}>
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-2.5 sm:p-4 select-none animate-in fade-in duration-200">
          <div
            onClick={onClose}
            className={`fixed inset-0 transition-opacity cursor-pointer ${
              hideBackdrop ? "bg-transparent" : "bg-foreground/50"
            }`}
          />

          <div
            className={`relative z-10 w-full bg-card border border-border rounded-none flex flex-col overflow-hidden text-foreground ${MODAL_PANEL_SIZE[size]} ${className}`}
          >
            {children}
          </div>
        </div>
      </ModalEditStateContext.Provider>
    </ModalEditDispatchContext.Provider>
  );
}

export interface BaseManagerModalHeaderProps {
  connector: Connector;
  onClose: () => void;
  subtitle?: React.ReactNode;
}

export function BaseManagerModalHeader({
  connector,
  onClose,
  subtitle,
}: BaseManagerModalHeaderProps) {
  return (
    <div className="h-[68px] flex items-center justify-between px-5 sm:px-6 border-b border-border bg-card shrink-0">
      <div className="flex items-center space-x-3">
        <div className="h-9 w-9 rounded-none bg-card border border-border flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
          <ConnectorIcon icon={connector.icon} name={connector.name} />
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-[13.5px] font-semibold text-foreground flex items-center gap-1.5 leading-tight">
              {connector.name}
            </h2>

            <span className="px-2 py-0.5 rounded-none text-[10.5px] font-semibold bg-secondary text-foreground border border-border">
              {connector.syncStatus === "running"
                ? "Analyzing..."
                : connector.status === "connected"
                  ? "Connected"
                  : "Disconnected"}
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
        className="text-muted-foreground hover:text-foreground p-1.5 rounded-none hover:bg-secondary transition-colors cursor-pointer"
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

export interface BaseManagerModalTabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
}

export function BaseManagerModalTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
}: BaseManagerModalTabsProps<T>) {
  return (
    <div className="h-[46px] flex items-end border-b border-border bg-card px-5 sm:px-6 gap-2 shrink-0 relative">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-none cursor-pointer flex items-center gap-2 border-t border-x -mb-px relative select-none ${
              isActive
                ? "bg-card text-foreground border-border z-10 after:absolute after:-bottom-px after:left-0 after:right-0 after:h-[2px] after:bg-card after:pointer-events-none"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-150 z-0"
            }`}
          >
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface BaseManagerModalFooterProps {
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
  editActions?: ModalEditActions | null;
}

export function BaseManagerModalFooter({
  leftSlot,
  rightSlot,
  className = "",
  editActions: propEditActions,
}: BaseManagerModalFooterProps) {
  const ctx = useModalEditContext();
  const editActions = propEditActions ?? ctx?.editActions ?? null;

  return (
    <div
      className={`h-[60px] px-5 sm:px-6 border-t border-border bg-card flex items-center justify-between shrink-0 ${className}`}
    >
      <div>{leftSlot}</div>
      <div className="flex items-center space-x-2">
        {editActions?.isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={editActions.onCancel}
              disabled={editActions.isSaving}
              className="px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer disabled:opacity-50"
            >
              {editActions.cancelLabel || "Cancel"}
            </button>
            <button
              type="button"
              onClick={editActions.onSave}
              disabled={editActions.isSaving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-brand hover:bg-brand-hover rounded-none transition-colors cursor-pointer disabled:opacity-50"
            >
              {editActions.isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{editActions.saveLabel || "Save Changes"}</span>
                </>
              )}
            </button>
          </div>
        ) : (
          rightSlot
        )}
      </div>
    </div>
  );
}

export function BaseManagerModal({
  connector,
  onClose,
  onUpdate,
  onRefresh,
}: ManagerModalProps) {
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const endpointSlug =
        connector.slug === "businessProfile"
          ? "business-profile"
          : connector.slug === "metaAds"
            ? "meta"
            : connector.slug === "shopify"
              ? "shopify"
              : connector.providerSlug;
      const res = await connectorsFetch(`/api/connectors/${endpointSlug}/disconnect`, {
        method: "POST",
      });

      if (res.ok) {
        toast.info(`${connector.name} disconnected`);
        onUpdate?.({
          status: "disconnected",
          expiresAt: null,
          permissions: null,
          metadata: null,
          updatedAt: new Date().toISOString(),
        });
        await onRefresh?.();
        onClose();
      } else {
        toast.error("Failed to disconnect connector");
      }
    } catch {
      toast.error("Network error disconnecting");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const permissions: string[] =
    Array.isArray(connector.permissions) && connector.permissions.length > 0
      ? connector.permissions
      : [];

  return (
    <BaseManagerModalDialog isOpen={true} onClose={onClose}>
      {/* Header */}
      <BaseManagerModalHeader connector={connector} onClose={onClose} />

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3 bg-card no-scrollbar">
        {/* Description & Overview */}
        <div className="bg-muted border border-border rounded-none p-2.5 sm:p-3 space-y-1.5">
          <span className="text-sm font-semibold text-foreground block">
            Integration Details
          </span>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {connector.description}
          </p>
        </div>

        {/* Enabled Permissions - Only show if permissions exist */}
        {permissions.length > 0 && (
          <div className="border border-border rounded-none p-2.5 sm:p-3 space-y-2">
            <span className="text-sm font-semibold text-foreground block">
              Enabled Permissions
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {permissions.map((perm, idx) => (
                <div
                  key={idx}
                  className="flex items-center space-x-2 text-xs text-foreground bg-muted border border-border rounded-none px-2 py-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  <span className="truncate">{perm}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sandboxed Environment Notice */}
        <div className="bg-muted border border-border rounded-none p-2.5 sm:p-3 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <div className="text-[13px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground block mb-0.5">
              Sandboxed Integration
            </span>
            This connector is scoped to your authorized workspace sessions with
            full auditability and TLS encrypted data exchange.
          </div>
        </div>
      </div>

      {/* Footer - Identical to Meta modal pattern */}
      <BaseManagerModalFooter
        leftSlot={
          connector.status === "connected" ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:text-destructive bg-card hover:bg-destructive-tint border border-border hover:border-destructive/25 rounded-none transition-colors disabled:opacity-40 cursor-pointer"
            >
              {isDisconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              <span>Disconnect</span>
            </button>
          ) : null
        }
        rightSlot={
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer"
          >
            {connector.status === "connected" ? "Done" : "Close"}
          </button>
        }
      />
    </BaseManagerModalDialog>
  );
}
