"use client";

import { connectorsFetch } from "../../../connectors.client";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { LogOut, Loader2, RotateCw } from "lucide-react";
import {
  BaseManagerModalTabs,
  BaseManagerModalDialog,
  BaseManagerModalHeader,
  BaseManagerModalFooter,
} from "../base.modal";
import type { ManagerModalProps } from "../registry";
import type { BusinessProfileConnectorSchema } from "../../../lib/business.profile";
import { BusinessProfileConnectHero } from "./business.profile.connect.hero";
import { BusinessProfileAnalysisLoader } from "./business.profile.loader";
import { BusinessProfileRetryView } from "./business.profile.retry.view";
import {
  BusinessProfileBrandingTab,
  BusinessProfileCompetitorsTab,
  BusinessProfileGeographyTab,
} from "./tabs";
import type { BusinessProfileTabId } from "./types";

/** First poll delay; the server's analysis usually takes minutes. */
const POLL_INITIAL_DELAY_MS = 12_000;
/** Growth cap once the first few 12s polls have elapsed. */
const POLL_MAX_DELAY_MS = 60_000;
/** Hard stop matching the server's 10-minute run budget. */
const POLL_DEADLINE_MS = 10 * 60 * 1000;
/** Shown when polling outlives the server's run budget. */
const ANALYSIS_TIMEOUT_ERROR =
  "Analysis took too long and was stopped. Retry to rebuild the profile.";

/** The persisted error a healed/cancelled run leaves on connector metadata. */
function metadataError(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const error = (metadata as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

export function BusinessProfileManagerModal({
  connector,
  onClose,
  onUpdate,
  onRefresh,
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
  const [actionState, setActionState] = useState<
    "idle" | "connecting" | "disconnecting"
  >("idle");

  const [connectError, setConnectError] = useState<string | null>(() =>
    metadataError(connector.metadata),
  );

  // A healed/cancelled run leaves only `{ error }` in metadata. Treat it as a
  // retryable failure, not a saved profile (which always has a brand).
  const isConnected = Boolean(metadata?.brand);
  // A stale "running" flag on an already-connected profile must not keep the
  // loader up — that is what left the UI stuck on "Analyzing..." forever.
  const isConnecting =
    actionState === "connecting" ||
    (connector.syncStatus === "running" && connector.status !== "connected");
  const isDisconnecting = actionState === "disconnecting";

  // Guards late fetch/poll callbacks after the modal has been closed.
  const mountedRef = useRef(true);
  const connectAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      connectAbortRef.current?.abort();
      connectAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    const meta =
      (connector.metadata as unknown as BusinessProfileConnectorSchema) ?? null;
    setMetadata(meta);
    if (meta?.url) {
      setTargetUrl(meta.url);
    }
    const error = metadataError(connector.metadata);
    if (error) setConnectError(error);
  }, [connector]);

  // Bounded status poll. Terminal state ends it immediately; the hard
  // deadline matches the server's 10-minute run budget so a row that somehow
  // stays `running` still leaves the loader instead of spinning forever.
  useEffect(() => {
    if (connector.syncStatus !== "running" && actionState !== "connecting")
      return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    let delay = POLL_INITIAL_DELAY_MS;

    const recordedStart = connector.syncStartedAt
      ? Date.parse(connector.syncStartedAt)
      : Number.NaN;
    const startedAt = Number.isFinite(recordedStart)
      ? recordedStart
      : Date.now();

    const stop = (): void => {
      stopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const poll = async (): Promise<void> => {
      timer = undefined;
      if (stopped) return;

      try {
        const res = await connectorsFetch("/api/connectors/business.profile");
        if (stopped) return;
        if (res.ok) {
          const data = await res.json();
          if (stopped) return;
          const bp = data.connector;
          if (bp && bp.syncStatus === "idle") {
            if (bp.status === "connected" && bp.metadata) {
              if (mountedRef.current) {
                setMetadata(bp.metadata as BusinessProfileConnectorSchema);
                setConnectError(null);
                setActionState("idle");
                onUpdate?.(bp);
                toast.success(
                  "Business profile analyzed and connected successfully!",
                );
              }
              return;
            }
            // While our own connect request is in flight it owns the
            // outcome; an idle snapshot may predate the run-start write.
            if (actionState !== "connecting") {
              const errorMsg = metadataError(bp.metadata);
              if (errorMsg && mountedRef.current) {
                setConnectError(errorMsg);
                setActionState("idle");
                onUpdate?.(bp);
                toast.error(errorMsg);
              } else if (bp.status === "disconnected" && mountedRef.current) {
                setActionState("idle");
                onUpdate?.(bp);
              }
              return;
            }
          }
        }
      } catch (err) {
        if (!stopped) {
          console.error("Connector sync check failed:", err);
        }
      }

      if (stopped) return;

      if (Date.now() - startedAt >= POLL_DEADLINE_MS) {
        if (mountedRef.current) {
          setConnectError(ANALYSIS_TIMEOUT_ERROR);
          setActionState("idle");
          onUpdate?.({ syncStatus: "idle" });
        }
        return;
      }

      polls += 1;
      // Keep the first few polls at 12s, then back off toward one minute.
      if (polls >= 3) {
        delay = Math.min(Math.round(delay * 1.5), POLL_MAX_DELAY_MS);
      }
      timer = setTimeout(() => {
        void poll();
      }, delay);
    };

    timer = setTimeout(() => {
      void poll();
    }, POLL_INITIAL_DELAY_MS);

    return stop;
  }, [connector.syncStatus, connector.syncStartedAt, actionState, onUpdate]);

  const handleConnect = async (url: string) => {
    const cleanUrl = url.trim();

    // One connect request at a time: a retry replaces the previous attempt.
    connectAbortRef.current?.abort();
    const controller = new AbortController();
    connectAbortRef.current = controller;

    setTargetUrl(cleanUrl);
    setConnectError(null);
    setActionState("connecting");
    onUpdate?.({ syncStatus: "running" });

    try {
      const res = await connectorsFetch("/api/connectors/business.profile/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl }),
        signal: controller.signal,
      });

      if (controller.signal.aborted || !mountedRef.current) return;

      const json = await res.json().catch(() => ({}));

      if (controller.signal.aborted || !mountedRef.current) return;

      if (!res.ok) {
        const errorMsg = json.error || "Failed to analyze website";
        setConnectError(errorMsg);
        toast.error(errorMsg);
        setActionState("idle");
        onUpdate?.({ syncStatus: "idle" });
        return;
      }

      // The connect call resolves only after the analysis run finishes, so
      // settle the UI immediately instead of waiting for the next poll.
      const bp = json.connector;
      if (bp?.metadata) {
        setMetadata(bp.metadata as BusinessProfileConnectorSchema);
      }
      setConnectError(null);
      setActionState("idle");
      onUpdate?.(bp ?? { status: "connected", syncStatus: "idle" });
      await onRefresh?.();
      if (!mountedRef.current) return;
      toast.success("Business profile analyzed and connected successfully!");
    } catch (err) {
      // Closing the modal aborts the request; that is not a failure.
      if (controller.signal.aborted || !mountedRef.current) return;

      const errorMsg =
        err instanceof Error ? err.message : "Failed to analyze website";
      setConnectError(errorMsg);
      toast.error(errorMsg);
      setActionState("idle");
      onUpdate?.({ syncStatus: "idle" });
    } finally {
      if (connectAbortRef.current === controller) {
        connectAbortRef.current = null;
      }
    }
  };

  /** Closing aborts an in-flight analysis so the server stops the run too. */
  const handleClose = () => {
    if (connectAbortRef.current) {
      connectAbortRef.current.abort();
      connectAbortRef.current = null;
      onUpdate?.({ syncStatus: "idle" });
    }
    onClose();
  };

  const handleDisconnect = async () => {
    setActionState("disconnecting");
    try {
      const res = await connectorsFetch("/api/connectors/business.profile/disconnect", {
        method: "POST",
      });

      if (res.ok) {
        toast.info("Business Profile disconnected");
        setMetadata(null);
        onUpdate?.({
          status: "disconnected",
          metadata: null,
          updatedAt: new Date().toISOString(),
        });
        await onRefresh?.();
      } else {
        toast.error("Failed to disconnect connector");
      }
    } catch {
      toast.error("Network error disconnecting");
    } finally {
      setActionState("idle");
    }
  };

  const handleReanalyze = async () => {
    if (!metadata?.url) return;
    await handleConnect(metadata.url);
  };

  return (
    <BaseManagerModalDialog isOpen={true} onClose={handleClose} size="wide">
      {/* Header */}
      <BaseManagerModalHeader
        connector={{
          ...connector,
          status: isConnected ? "connected" : "disconnected",
        }}
        onClose={handleClose}
      />

      {/* Body: Deep Scan Loader, Connect Hero, Error Retry, or Multi-Tab Manager */}
      {isConnecting ? (
        <BusinessProfileAnalysisLoader />
      ) : connectError && !isConnected ? (
        <BusinessProfileRetryView
          url={targetUrl}
          error={connectError}
          onRetry={() => handleConnect(targetUrl)}
          onChangeUrl={() => setConnectError(null)}
        />
      ) : !isConnected ? (
        <BusinessProfileConnectHero
          initialUrl={targetUrl}
          onConnect={handleConnect}
          isLoading={isConnecting}
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
                    const updatedMetadata: BusinessProfileConnectorSchema = {
                      ...metadata,
                      url: updatedUrl ?? metadata.url,
                      brand: updatedBrand,
                    };
                    setMetadata(updatedMetadata);
                    onUpdate?.({
                      metadata: updatedMetadata as unknown as Record<
                        string,
                        unknown
                      >,
                    });

                    const res = await connectorsFetch(
                      "/api/connectors/business.profile",
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ metadata: updatedMetadata }),
                      },
                    );

                    if (!res.ok) {
                      const json = await res.json().catch(() => ({}));
                      throw new Error(
                        json.error || "Failed to save branding settings",
                      );
                    }
                  }}
                />
              )}

              {activeTabId === "geography" && (
                <BusinessProfileGeographyTab
                  data={metadata}
                  onSave={async (updatedGeography) => {
                    const updatedMetadata: BusinessProfileConnectorSchema = {
                      ...metadata,
                      geography: updatedGeography,
                    };
                    setMetadata(updatedMetadata);
                    onUpdate?.({
                      metadata: updatedMetadata as unknown as Record<
                        string,
                        unknown
                      >,
                    });

                    const res = await connectorsFetch(
                      "/api/connectors/business.profile",
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ metadata: updatedMetadata }),
                      },
                    );

                    if (!res.ok) {
                      const json = await res.json().catch(() => ({}));
                      throw new Error(
                        json.error || "Failed to save geography settings",
                      );
                    }
                  }}
                />
              )}
              {activeTabId === "competitors" && (
                <BusinessProfileCompetitorsTab
                  data={metadata}
                  onSave={async (updatedCompetitors) => {
                    const updatedMetadata: BusinessProfileConnectorSchema = {
                      ...metadata,
                      competitors: updatedCompetitors,
                    };
                    setMetadata(updatedMetadata);
                    onUpdate?.({
                      metadata: updatedMetadata as unknown as Record<
                        string,
                        unknown
                      >,
                    });

                    const res = await connectorsFetch(
                      "/api/connectors/business.profile",
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ metadata: updatedMetadata }),
                      },
                    );

                    if (!res.ok) {
                      const json = await res.json().catch(() => ({}));
                      throw new Error(
                        json.error || "Failed to save competitor settings",
                      );
                    }
                  }}
                />
              )}
            </div>
          </>
        )
      )}

      {/* Footer (Hidden during loading state) */}
      {!isConnecting && (
        <BaseManagerModalFooter
          leftSlot={
            isConnected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-destructive hover:text-destructive bg-card hover:bg-destructive-tint border border-border hover:border-destructive/25 rounded-none transition-colors disabled:opacity-40 cursor-pointer"
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
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Re-analyze</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="px-3.5 py-1.5 text-xs font-semibold text-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer"
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
