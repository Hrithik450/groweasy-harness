"use client";

import { create } from "zustand";
import {
  type Connector,
  AVAILABLE_CONNECTORS,
} from "@/lib/connectors/registry";
import type { ConnectorSlug } from "@/lib/db";

interface ConnectorState {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;

  /** One entry per slug; writing one never touches the others. */
  connectors: Record<string, Connector>;
  /** Catalogue display order, independent of connection state. */
  order: ConnectorSlug[];

  setConnectors: (connectors: Connector[]) => void;
  updateConnector: (slug: ConnectorSlug, updates: Partial<Connector>) => void;

  activeManagerSlug: ConnectorSlug | null;
  openManager: (slug: ConnectorSlug) => void;
  closeManager: () => void;
}

function bySlug(list: readonly Connector[]): Record<string, Connector> {
  const map: Record<string, Connector> = {};
  for (const connector of list) map[connector.slug] = connector;
  return map;
}

export const useConnectorStore = create<ConnectorState>((set) => ({
  isModalOpen: false,
  activeManagerSlug: null,
  connectors: bySlug(AVAILABLE_CONNECTORS),
  order: AVAILABLE_CONNECTORS.map((connector) => connector.slug),

  openModal: () => set({ isModalOpen: true }),
  closeModal: () =>
    set({
      isModalOpen: false,
      activeManagerSlug: null,
    }),

  openManager: (slug: ConnectorSlug) =>
    set({
      activeManagerSlug: slug,
    }),

  closeManager: () =>
    set({
      activeManagerSlug: null,
    }),

  setConnectors: (connectors: Connector[]) =>
    set({
      connectors: bySlug(connectors),
      order: connectors.map((connector) => connector.slug),
    }),

  updateConnector: (slug: ConnectorSlug, updates: Partial<Connector>) => {
    set((state) => {
      const current = state.connectors[slug];
      if (!current) return state;

      // Identical snapshots (a re-read that changed nothing) must not re-render.
      const changed = Object.entries(updates).some(
        ([key, value]) => current[key as keyof Connector] !== value,
      );
      if (!changed) return state;

      return {
        connectors: { ...state.connectors, [slug]: { ...current, ...updates } },
      };
    });
  },
}));

/** Subscribe to one connector; other slugs' writes do not re-render. */
export function useConnector(slug: ConnectorSlug | null | undefined) {
  return useConnectorStore((state) =>
    slug ? state.connectors[slug] : undefined,
  );
}
