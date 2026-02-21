import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarStore {
  isOpen: boolean;        // 모바일 드로어
  isCollapsed: boolean;   // 데스크탑 사이드바 접힘
  isActivityOpen: boolean; // 활동 피드 패널
  open: () => void;
  close: () => void;
  toggle: () => void;
  toggleCollapse: () => void;
  toggleActivity: () => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      isOpen: false,
      isCollapsed: false,
      isActivityOpen: true,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      toggleActivity: () => set((state) => ({ isActivityOpen: !state.isActivityOpen })),
    }),
    { name: "lumen-sidebar" }
  )
);
