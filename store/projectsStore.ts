import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idbKv";
import type { SourceFile } from "@/lib/types";

export type ProjectKind = "folder" | "github" | "paste" | "sample";

export interface ProjectRecord {
  id: string;
  name: string;
  kind: ProjectKind;
  createdAt: number;
  updatedAt: number;
  // text files are persisted for folder/paste/sample; github projects re-fetch
  files?: SourceFile[];
  baseHref?: string | null;
  repoUrl?: string;
  github?: { owner: string; repo: string; branch: string };
  storage?: "device"; // backed by a real folder on disk (handle in IndexedDB)
  status: { published: boolean; github: boolean };
}

interface ProjectsState {
  projects: ProjectRecord[];
  addProject: (p: Omit<ProjectRecord, "id" | "createdAt" | "updatedAt">) => ProjectRecord;
  updateProject: (id: string, patch: Partial<ProjectRecord>) => void;
  removeProject: (id: string) => void;
  getProject: (id: string) => ProjectRecord | undefined;
}

export const useProjects = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      addProject: (p) => {
        const now = Date.now();
        const rec: ProjectRecord = {
          ...p,
          id: `p_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          createdAt: now,
          updatedAt: now,
        };
        set({ projects: [rec, ...get().projects] });
        return rec;
      },
      updateProject: (id, patch) =>
        set({
          projects: get().projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
          ),
        }),
      removeProject: (id) => set({ projects: get().projects.filter((p) => p.id !== id) }),
      getProject: (id) => get().projects.find((p) => p.id === id),
    }),
    {
      name: "nova-projects",
      // IndexedDB instead of localStorage: bigger quota for project files, and
      // durable on Firefox/Safari too (migrates any existing localStorage data).
      storage: createJSONStorage(() => idbStorage()),
    }
  )
);
