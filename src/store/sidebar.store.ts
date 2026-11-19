import { create } from "zustand";

interface SidebarState {
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
  isMobileOpen: boolean;

  toggleLeftCollapsed: () => void;
  toggleRightCollapsed: () => void;
  toggleMobile: () => void;
  closeMobile: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  isLeftCollapsed: false,
  isRightCollapsed: false,
  isMobileOpen: false,

  toggleLeftCollapsed: () => {
    set({ isLeftCollapsed: !get().isLeftCollapsed });
  },
  toggleRightCollapsed: () => {
    set({ isRightCollapsed: !get().isRightCollapsed });
  },
  toggleMobile: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
  closeMobile: () => set({ isMobileOpen: false }),
}));
