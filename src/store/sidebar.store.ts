import { create } from "zustand";

interface SidebarState {
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
  isMobileOpen: boolean;
  /** Below 1280px the detail bar is an overlay drawer, not a column. */
  isDetailDrawerOpen: boolean;

  toggleLeftCollapsed: () => void;
  toggleRightCollapsed: () => void;
  toggleMobile: () => void;
  closeMobile: () => void;
  toggleDetailDrawer: () => void;
  openDetailDrawer: () => void;
  closeDetailDrawer: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  isLeftCollapsed: false,
  isRightCollapsed: false,
  isMobileOpen: false,
  isDetailDrawerOpen: false,

  toggleLeftCollapsed: () => {
    set({ isLeftCollapsed: !get().isLeftCollapsed });
  },
  toggleRightCollapsed: () => {
    set({ isRightCollapsed: !get().isRightCollapsed });
  },
  toggleMobile: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
  closeMobile: () => set({ isMobileOpen: false }),
  toggleDetailDrawer: () =>
    set((state) => ({ isDetailDrawerOpen: !state.isDetailDrawerOpen })),
  openDetailDrawer: () => set({ isDetailDrawerOpen: true }),
  closeDetailDrawer: () => set({ isDetailDrawerOpen: false }),
}));
