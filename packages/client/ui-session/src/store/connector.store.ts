"use client";

import { create } from "zustand";
import {
  type Connector,
  type ConnectorSlug,
  AVAILABLE_CONNECTORS,
} from "../types/connectors";

interface ConnectorState {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;

  connectors: Connector[];
  setConnectors: (connectors: Partial<Connector>[]) => void;
  updateConnector: (slug: ConnectorSlug, updates: Partial<Connector>) => void;

  activeManagerSlug: ConnectorSlug | null;
  openManager: (slug: ConnectorSlug) => void;
  closeManager: () => void;
}

export const useConnectorStore = create<ConnectorState>((set) => ({
  isModalOpen: false,
  activeManagerSlug: null,
  connectors: AVAILABLE_CONNECTORS,

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

  setConnectors: (userConnectors: Partial<Connector>[]) =>
    set(() => ({
      connectors: AVAILABLE_CONNECTORS.map((def) => {
        const match = userConnectors.find(
          (c) => c.slug === def.slug || (c.providerSlug && c.providerSlug === def.providerSlug),
        );
        if (!match) {
          return {
            ...def,
            status: "disconnected" as const,
            syncStatus: "idle" as const,
            permissions: null,
            expiresAt: null,
            metadata: null,
          };
        }
        return {
          ...def,
          ...match,
          id: match.id || def.id,
          status: match.status || "disconnected",
          syncStatus: match.syncStatus || "idle",
          metadata: match.metadata ?? null,
        };
      }),
    })),

  updateConnector: (slug: ConnectorSlug, updates: Partial<Connector>) => {
    set((state) => ({
      connectors: state.connectors.map((c) =>
        c.slug === slug ? { ...c, ...updates } : c,
      ),
    }));
  },
}));
