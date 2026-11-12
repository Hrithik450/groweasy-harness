"use client";

import { connectorsFetch } from "../connectors.client";
import { X, Search, Check, Settings2, Loader2 } from "lucide-react";
import { BotDollLoader } from "@openai-harness/client-ui-chat/client";
import { useConnectorStore } from "@openai-harness/client-ui-session";
import { useState, useEffect, useCallback, useRef } from "react";
import { ConnectorIcon } from "./managers";
import { MODAL_PANEL_SIZE } from "./managers/base.modal";
import { getProviderFromSlug } from "../lib";
import { CONNECTOR_SLUGS } from "../lib/constants";
import { OAUTH_RETURN_PARAMS, removeQueryParams } from "../lib/utils";

type ConnectorSlug = (typeof CONNECTOR_SLUGS)[number];

export function ConnectorsModal() {
  const {
    isModalOpen,
    openModal,
    closeModal,
    activeManagerSlug,
    openManager,
    connectors,
    setConnectors,
  } = useConnectorStore();

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Stable so the modal-open effect runs once per open, not on every render.
  const handleRefresh = useCallback(async () => {
    try {
      const res = await connectorsFetch("/api/connectors");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.connectors)) {
          setConnectors(data.connectors);
        }
      }
    } catch (err) {
      console.error("Error fetching connectors:", err);
    }
  }, [setConnectors]);

  // The provider manager is revealed only after `handleRefresh` lands, so it
  // renders the connected state instead of flashing the "Connect" hero.
  const pendingManagerRef = useRef<ConnectorSlug | null>(null);
  const consumedReturnRef = useRef(false);

  useEffect(() => {
    if (consumedReturnRef.current) return;
    consumedReturnRef.current = true;

    const slug = new URLSearchParams(window.location.search).get(
      "open_connector",
    );
    if (!slug) return;

    if (!(CONNECTOR_SLUGS as readonly string[]).includes(slug)) {
      removeQueryParams(OAUTH_RETURN_PARAMS);
      return;
    }

    pendingManagerRef.current = slug as ConnectorSlug;
    // Leave the provider's own `*_connected` flag for its manager: that effect
    // toasts and activates the connector once. The rest is cleared here.
    removeQueryParams(["open_connector"]);
    openModal();
  }, [openModal]);

  useEffect(() => {
    if (!isModalOpen) return;
    let cancelled = false;
    setIsLoading(true);
    handleRefresh().finally(() => {
      if (cancelled) return;
      setIsLoading(false);
      const pending = pendingManagerRef.current;
      if (pending) {
        pendingManagerRef.current = null;
        openManager(pending);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, handleRefresh, openManager]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen && !activeManagerSlug) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, activeManagerSlug, closeModal]);

  if (!isModalOpen) return null;

  const handleAction = (slug: ConnectorSlug) => {
    openManager(slug);
  };

  const filtered = connectors.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const provider = getProviderFromSlug(c.providerSlug).toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        provider.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 select-none animate-in fade-in duration-200">
        <div
          onClick={closeModal}
          className="fixed inset-0 bg-foreground/50 transition-opacity cursor-pointer"
        />

        {/* Modal Dialog Window */}
        <div
          className={`relative z-10 w-full bg-card border border-border rounded-none flex flex-col overflow-hidden text-foreground ${MODAL_PANEL_SIZE.wide}`}
        >
          {/* Top Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border bg-card shrink-0">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Connectors
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Supercharge your business with custom &amp; built-in connectors.
              </p>
            </div>

            <button
              type="button"
              onClick={closeModal}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-none hover:bg-secondary transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Content */}
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-card">
              <BotDollLoader
                variant="center"
                text="Loading connectors"
                subtitle="Syncing connection status and integrations..."
              />
            </div>
          ) : (
            <>
              {/* Search Bar */}
              <div className="px-5 sm:px-6 py-3 border-b border-border bg-card/80 flex items-center shrink-0">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tools, platforms, databases..."
                    className="w-full bg-card border border-border rounded-none pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:ring-2 focus:ring-ring/10 transition-all"
                  />
                </div>
              </div>

              {/* Connectors Grid Area (Full Width) */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 no-scrollbar bg-card">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-muted-foreground">
                    <p className="text-sm font-medium text-foreground">
                      No connectors found
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Try searching with a different term.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filtered.map((connector) => {
                      return (
                        <div
                          key={connector.slug}
                          className={`group relative flex flex-col justify-between p-5 bg-card hover:bg-muted border rounded-none transition-all ${
                            connector.status === "connected"
                              ? "border-foreground/40 hover:border-foreground/40"
                              : "border-border hover:border-input"
                          }`}
                        >
                          <div>
                            {/* Card Header: Dynamic Icon & Name */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 rounded-none border flex items-center justify-center shrink-0 bg-card border-border p-1 overflow-hidden">
                                  <ConnectorIcon
                                    icon={connector.icon}
                                    name={connector.name}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
                                    {connector.name}
                                  </h3>
                                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight truncate">
                                    By{" "}
                                    {getProviderFromSlug(
                                      connector.providerSlug,
                                    )}
                                  </p>
                                </div>
                              </div>

                              {connector.status === "connected" && (
                                <div
                                  title="Active"
                                  className="w-4 h-4 rounded-none bg-brand text-primary-foreground flex items-center justify-center shrink-0"
                                >
                                  <Check
                                    className="w-2.5 h-2.5 text-primary-foreground"
                                    strokeWidth={3}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Description */}
                            <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">
                              {connector.description}
                            </p>
                          </div>

                          {/* Card Footer: Action Button */}
                          <div className="pt-4 mt-3 border-t border-border flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => handleAction(connector.slug)}
                              className={`px-3.5 py-1.5 rounded-none text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                connector.syncStatus === "running"
                                  ? "border border-brand/30 bg-success-tint text-brand"
                                  : connector.status === "connected"
                                    ? "bg-brand hover:bg-brand-hover text-primary-foreground"
                                    : "border border-input hover:border-input bg-card hover:bg-muted text-foreground"
                              }`}
                            >
                              {connector.syncStatus === "running" ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Analyzing...</span>
                                </>
                              ) : connector.status === "connected" ? (
                                <>
                                  <Settings2 className="w-3.5 h-3.5" />
                                  <span>Manage</span>
                                </>
                              ) : (
                                <span>Connect</span>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
  );
}
