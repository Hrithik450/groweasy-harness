import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

function syncHtmlDataset(side: "left" | "right", isCollapsed: boolean) {
  if (typeof document === "undefined") return;
  const attr = side === "left" ? "sidebarLeft" : "sidebarRight";
  if (isCollapsed) {
    document.documentElement.dataset[attr] = "collapsed";
  } else {
    delete document.documentElement.dataset[attr];
  }
}

interface SidebarState {
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
  isMobileOpen: boolean;

  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  toggleLeftCollapsed: () => void;
  toggleRightCollapsed: () => void;
  toggleMobile: () => void;
  closeMobile: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      isLeftCollapsed: false,
      isRightCollapsed: false,
      isMobileOpen: false,

      setLeftCollapsed: (collapsed: boolean) => {
        set({ isLeftCollapsed: collapsed });
        syncHtmlDataset("left", collapsed);
      },
      setRightCollapsed: (collapsed: boolean) => {
        set({ isRightCollapsed: collapsed });
        syncHtmlDataset("right", collapsed);
      },
      toggleLeftCollapsed: () => {
        const next = !get().isLeftCollapsed;
        set({ isLeftCollapsed: next });
        syncHtmlDataset("left", next);
      },
      toggleRightCollapsed: () => {
        const next = !get().isRightCollapsed;
        set({ isRightCollapsed: next });
        syncHtmlDataset("right", next);
      },
      toggleMobile: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
      closeMobile: () => set({ isMobileOpen: false }),
    }),
    {
      name: "sidebar-storage",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          syncHtmlDataset("left", state.isLeftCollapsed);
          syncHtmlDataset("right", state.isRightCollapsed);
        }
      },
      partialize: (state) => ({
        isLeftCollapsed: state.isLeftCollapsed,
        isRightCollapsed: state.isRightCollapsed,
      }),
    },
  ),
);
