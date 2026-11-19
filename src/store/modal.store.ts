"use client";

import { create } from "zustand";

export interface LightboxImage {
  src: string;
  alt: string;
  aspectRatio?: string;
}

export type SettingsTab =
  | "account"
  | "general"
  | "business_profile"
  | "business_products"
  | "business_locations"
  | "business_competitors"
  | "business_brand"
  | "models"
  | "plugins"
  | "presets";

interface ModalState {
  // Automation Schedule Modal
  isScheduleModalOpen: boolean;
  openScheduleModal: () => void;
  closeScheduleModal: () => void;

  // New Session Modal
  isNewSessionModalOpen: boolean;
  openNewSessionModal: () => void;
  closeNewSessionModal: () => void;

  // Settings Modal
  isSettingsModalOpen: boolean;
  settingsTab: SettingsTab;
  openSettingsModal: (tab?: SettingsTab) => void;
  closeSettingsModal: () => void;
  setSettingsTab: (tab: SettingsTab) => void;

  // Image Lightbox
  lightbox: {
    isOpen: boolean;
    images: LightboxImage[];
    index: number;
  };
  openLightbox: (images: LightboxImage[], index?: number) => void;
  closeLightbox: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isScheduleModalOpen: false,
  openScheduleModal: () => set({ isScheduleModalOpen: true }),
  closeScheduleModal: () => set({ isScheduleModalOpen: false }),

  isNewSessionModalOpen: false,
  openNewSessionModal: () => set({ isNewSessionModalOpen: true }),
  closeNewSessionModal: () => set({ isNewSessionModalOpen: false }),

  isSettingsModalOpen: false,
  settingsTab: "account",
  openSettingsModal: (tab = "account") => {
    const targetTab = tab === "business_profile" ? "business_products" : tab;
    set({ isSettingsModalOpen: true, settingsTab: targetTab });
  },
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),
  setSettingsTab: (tab) => {
    const targetTab = tab === "business_profile" ? "business_products" : tab;
    set({ settingsTab: targetTab });
  },

  lightbox: {
    isOpen: false,
    images: [],
    index: 0,
  },
  openLightbox: (images, index = 0) =>
    set({
      lightbox: {
        isOpen: true,
        images,
        index,
      },
    }),
  closeLightbox: () =>
    set((state) => ({
      lightbox: {
        ...state.lightbox,
        isOpen: false,
      },
    })),
}));
