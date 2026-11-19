"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LogOut, Loader2, RotateCw } from "lucide-react";
import {
  BaseManagerModalTabs,
  BaseManagerModalDialog,
  BaseManagerModalHeader,
  BaseManagerModalFooter,
} from "../base.modal";
import type { ManagerModalProps } from "../registry";
import type { BusinessProfileConnectorSchema } from "@/lib/connectors/business.profile";
import { BusinessProfileConnectHero } from "./business.profile.connect.hero";
import { BusinessProfileAnalysisLoader } from "./business.profile.loader";
import { BusinessProfileRetryView } from "./business.profile.retry.view";
import {
  BusinessProfileBrandingTab,
  BusinessProfileCompetitorsTab,
  BusinessProfileGeographyTab,
} from "./tabs";
import type { BusinessProfileTabId } from "./types";

const SCAN_TIMEOUT_MS = 6 * 60 * 1000;

export function BusinessProfileManagerModal({
  connector,
  onClose,
}: ManagerModalProps) {
  const [metadata, setMetadata] =
    useState<BusinessProfileConnectorSchema | null>(
      (connector.metadata as unknown as BusinessProfileConnectorSchema) || null,
    );
  const [targetUrl, setTargetUrl] = useState<string>(
    (connector.metadata as unknown as BusinessProfileConnectorSchema)?.url ||
      "",
  );
  const [activeTabId, setActiveTabId] =
    useState<BusinessProfileTabId>("branding");
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  // The loader is stream-driven, so guard the gap before `running` arrives.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // Request failures the server never saw (network, timeout) stay local; a
  // failed scan is already published as `status: "error"`.
  const [requestError, setRequestError] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);

  const isConnected = connector.status === "connected";
  const isConnecting = connector.status === "running";
  const storedError =
    connector.status === "error"
      ? (((connector.metadata as { error?: unknown } | null)?.error as
          | string
          | undefined) ?? "Failed to analyze website")
      : null;
  const connectError = errorDismissed ? null : (requestError ?? storedError);

  useEffect(() => {
    const meta =
      (connector.metadata as unknown as BusinessProfileConnectorSchema) ?? null;
    setMetadata(meta);
    if (meta?.url) {
      setTargetUrl(meta.url);
    }
  }, [connector]);

  // Any fresh stream frame supersedes the last local failure.
  useEffect(() => {
    if (connector.status === "running" || connector.status === "connected") {
      setRequestError(null);
      setErrorDismissed(false);
    }
  }, [connector.status]);

  const handleConnect = async (url: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    const cleanUrl = url.trim();
    setTargetUrl(cleanUrl);
    setRequestError(null);
    setErrorDismissed(false);

    try {
      const res = await fetch("/api/connectors/business.profile/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl }),
        signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const errorMsg = json.error || "Failed to analyze website";
        setRequestError(errorMsg);
      }
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : "Failed to analyze website",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/connectors/business.profile/disconnect", {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Failed to disconnect connector");
      }
    } catch {
      toast.error("Network error disconnecting");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleReanalyze = async () => {
    if (!metadata?.url) return;
    await handleConnect(metadata.url);
  };

  const saveMetadata = async (updated: BusinessProfileConnectorSchema) => {
    // Local view refresh; the store gets the same write back over the stream.
    setMetadata(updated);

    const res = await fetch("/api/connectors/business.profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: updated }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || "Failed to save settings");
    }
  };

  return (
    <BaseManagerModalDialog isOpen={true} onClose={onClose}>
      <BaseManagerModalHeader connector={connector} onClose={onClose} />

      {isConnecting ? (
        <BusinessProfileAnalysisLoader />
      ) : connectError ? (
        <BusinessProfileRetryView
          url={targetUrl}
          error={connectError}
          onRetry={() => handleConnect(targetUrl)}
          onChangeUrl={() => setErrorDismissed(true)}
        />
      ) : !isConnected ? (
        <BusinessProfileConnectHero
          initialUrl={targetUrl}
          onConnect={handleConnect}
          isLoading={isConnecting || isSubmitting}
        />
      ) : (
        metadata && (
          <>
            <BaseManagerModalTabs
              tabs={[
                { id: "branding", label: "Branding" },
                { id: "geography", label: "Geography" },
                { id: "competitors", label: "Competitors" },
              ]}
              activeTab={activeTabId}
              onChange={(id) => setActiveTabId(id as BusinessProfileTabId)}
            />

            <div className="p-5 sm:p-6 overflow-y-auto space-y-3 bg-card flex-1 no-scrollbar">
              {activeTabId === "branding" && (
                <BusinessProfileBrandingTab
                  data={metadata}
                  onSave={async (updatedBrand, updatedUrl) => {
                    await saveMetadata({
                      ...metadata,
                      url: updatedUrl ?? metadata.url,
                      brand: updatedBrand,
                    });
                  }}
                />
              )}

              {activeTabId === "geography" && (
                <BusinessProfileGeographyTab
                  data={metadata}
                  onSave={async (updatedGeography) => {
                    await saveMetadata({
                      ...metadata,
                      geography: updatedGeography,
                    });
                  }}
                />
              )}

              {activeTabId === "competitors" && (
                <BusinessProfileCompetitorsTab
                  data={metadata}
                  onSave={async (updatedCompetitors) => {
                    await saveMetadata({
                      ...metadata,
                      competitors: updatedCompetitors,
                    });
                  }}
                />
              )}
            </div>
          </>
        )
      )}

      {!isConnecting && (
        <BaseManagerModalFooter
          leftSlot={
            isConnected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-destructive hover:text-destructive bg-card hover:bg-destructive-tint/70 border border-border hover:border-destructive-border rounded-lg transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
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
            <div className="flex items-center gap-2">
              {isConnected && (
                <button
                  type="button"
                  onClick={handleReanalyze}
                  disabled={isDisconnecting}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-lg transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Re-analyze</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                Done
              </button>
            </div>
          }
        />
      )}
    </BaseManagerModalDialog>
  );
}
