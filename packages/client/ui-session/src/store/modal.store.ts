"use client";

import { create } from "zustand";

/** One image the lightbox can present. */
export interface LightboxImage {
  src: string;
  alt: string;
  aspectRatio?: string;
}

export type SettingsTab =
  | "account"
  | "general"
  | "models"
  | "plugins"
  | "presets";

interface ModalState {
  isNewSessionModalOpen: boolean;
  openNewSessionModal: () => void;
  closeNewSessionModal: () => void;

  isSettingsModalOpen: boolean;
  settingsTab: SettingsTab;
  openSettingsModal: (tab?: SettingsTab) => void;
  closeSettingsModal: () => void;
  setSettingsTab: (tab: SettingsTab) => void;

  lightbox: {
    isOpen: boolean;
    images: LightboxImage[];
    index: number;
  };
  openLightbox: (images: LightboxImage[], index?: number) => void;
  closeLightbox: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isNewSessionModalOpen: false,
  openNewSessionModal: () => set({ isNewSessionModalOpen: true }),
  closeNewSessionModal: () => set({ isNewSessionModalOpen: false }),

  isSettingsModalOpen: false,
  settingsTab: "account",
  openSettingsModal: (tab = "account") => {
    set({ isSettingsModalOpen: true, settingsTab: tab });
  },
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),
  setSettingsTab: (tab) => {
    set({ settingsTab: tab });
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
