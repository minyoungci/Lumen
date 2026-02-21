import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  invite_token: string;
  role: "owner" | "member";
  created_at: string;
}

interface ProjectStore {
  currentProjectId: string | null;
  projects: Project[];
  setCurrentProject: (id: string | null) => void;
  setProjects: (projects: Project[]) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      currentProjectId: null,
      projects: [],
      setCurrentProject: (id) => set({ currentProjectId: id }),
      setProjects: (projects) => set({ projects }),
    }),
    { name: "lumen-project" }
  )
);
