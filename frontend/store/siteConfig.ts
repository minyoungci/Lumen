import { create } from "zustand";
import { DEFAULT_SITE_CONFIG, normalizeSiteConfig, type SiteConfig } from "@/lib/siteConfig";

interface SiteConfigState {
  config: SiteConfig;
  loaded: boolean;
  setConfig: (next: unknown) => void;
  setLoaded: (loaded: boolean) => void;
  reset: () => void;
}

export const useSiteConfigStore = create<SiteConfigState>((set) => ({
  config: DEFAULT_SITE_CONFIG,
  loaded: false,
  setConfig: (next) => set({ config: normalizeSiteConfig(next) }),
  setLoaded: (loaded) => set({ loaded }),
  reset: () => set({ config: DEFAULT_SITE_CONFIG, loaded: false }),
}));
