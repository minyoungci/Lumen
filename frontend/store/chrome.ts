import { create } from "zustand";

interface ChromeStore {
  isImmersiveMode: boolean;
  isChromeVisible: boolean;
  setImmersiveMode: (value: boolean) => void;
  showChrome: () => void;
  hideChrome: () => void;
  toggleChrome: () => void;
}

export const useChromeStore = create<ChromeStore>((set) => ({
  isImmersiveMode: false,
  isChromeVisible: false,
  setImmersiveMode: (value) =>
    set((state) => ({
      isImmersiveMode: value,
      isChromeVisible: value ? state.isChromeVisible : false,
    })),
  showChrome: () => set({ isChromeVisible: true }),
  hideChrome: () => set({ isChromeVisible: false }),
  toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
}));
