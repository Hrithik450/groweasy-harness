"use client";

import {
  Loader2,
  X,
  Search,
  Check,
  SlidersHorizontal,
  Settings2,
} from "lucide-react";
import { useConnectorStore } from "@/store/connector.store";
import { memo, useCallback, useMemo, useState, useEffect } from "react";
import { ConnectorIcon } from "./managers";
import { getProviderFromSlug } from "@/lib/connectors/utils";
import type { Connector } from "@/lib/connectors/registry";
import type { ConnectorSlug } from "@/lib/db";
import { ConnectorManagerModal } from "./connector.manager.modal";
import { MODAL_PANEL_SIZE } from "./managers/base.modal";

function matches(connector: Connector, query: string): boolean {
  return (
    connector.name.toLowerCase().includes(query) ||
    connector.description.toLowerCase().includes(query) ||
    getProviderFromSlug(connector.providerSlug).toLowerCase().includes(query)
  );
}

/** One card; memoized so only the slug that changed re-renders. */
const ConnectorCard = memo(function ConnectorCard({
  connector,
  onOpenManager,
}: {
  connector: Connector;
  onOpenManager: (slug: ConnectorSlug) => void;
}) {
  return (
    <div
      className={`group relative min-w-0 flex flex-col justify-between p-5 bg-card hover:bg-linen/60 border rounded-2xl transition-all shadow-2xs ${
        connector.status === "connected"
          ? "border-foreground/35 hover:border-foreground/55"
          : "border-border/80 hover:border-border-strong"
      }`}
    >
      <div>
        {/* Card Header: Dynamic Icon & Name */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs bg-card border-border/80 p-1 overflow-hidden">
              <ConnectorIcon icon={connector.icon} name={connector.name} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
                {connector.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight truncate">
                By {getProviderFromSlug(connector.providerSlug)}
              </p>
            </div>
          </div>

          {connector.status === "connected" && (
            <div
              title="Active"
              className="w-4 h-4 rounded-none bg-forest text-primary-foreground flex items-center justify-center shrink-0 shadow-2xs"
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
      <div className="pt-4 mt-3 border-t border-border-subtle flex items-center justify-between">
        <button
          type="button"
          onClick={() => onOpenManager(connector.slug)}
          className={`px-3.5 py-1.5 rounded-none text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            connector.status === "running"
              ? "border border-brand/30 bg-success-tint text-brand"
              : connector.status === "connected"
                ? "bg-brand hover:bg-brand-hover text-primary-foreground"
                : "border border-input hover:border-input bg-card hover:bg-muted text-foreground"
          }`}
        >
          {connector.status === "running" ? (
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
});

export function ConnectorsModal() {
  const isModalOpen = useConnectorStore((state) => state.isModalOpen);
  const closeModal = useConnectorStore((state) => state.closeModal);
  const activeManagerSlug = useConnectorStore(
    (state) => state.activeManagerSlug,
  );
  const openManager = useConnectorStore((state) => state.openManager);
  const connectors = useConnectorStore((state) => state.connectors);
  const order = useConnectorStore((state) => state.order);

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen && !activeManagerSlug) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, activeManagerSlug, closeModal]);

  const handleOpenManager = useCallback(
    (slug: ConnectorSlug) => openManager(slug),
    [openManager],
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return order
      .map((slug) => connectors[slug])
      .filter((connector): connector is Connector => Boolean(connector))
      .filter((connector) => (query ? matches(connector, query) : true));
  }, [order, connectors, searchQuery]);

  if (!isModalOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 select-none animate-in fade-in duration-200">
        <div
          onClick={closeModal}
          className="fixed inset-0 bg-foreground/50 backdrop-blur-xs transition-opacity cursor-pointer"
        />

        {/* Modal Dialog Window */}
        <div
          className={`relative z-10 w-full bg-card border border-border rounded-none flex flex-col overflow-hidden text-foreground ${MODAL_PANEL_SIZE.wide}`}
        >
          {/* Top Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border-subtle bg-card shrink-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-forest" />
                Connectors
              </h2>
              <p className="min-w-0 truncate text-xs text-muted-foreground mt-0.5">
                Supercharge your business with custom &amp; built-in connectors.
              </p>
            </div>

            <button
              type="button"
              onClick={closeModal}
              className="shrink-0 text-muted-2 hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <>
            {/* Search Bar */}
            <div className="px-5 sm:px-6 py-3 border-b border-border-subtle bg-linen/80 flex items-center shrink-0">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tools, platforms, databases..."
                  className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-2 focus:outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all shadow-2xs"
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
                  <p className="text-xs text-muted-2 mt-1">
                    Try searching with a different term.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filtered.map((connector) => (
                    <ConnectorCard
                      key={connector.slug}
                      connector={connector}
                      onOpenManager={handleOpenManager}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        </div>
      </div>

      {/* Sub Manager Modal */}
      <ConnectorManagerModal />
    </>
  );
}
