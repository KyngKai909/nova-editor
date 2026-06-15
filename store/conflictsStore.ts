import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idbKv";

// Unresolved merge conflicts from a GitHub Pull, kept per project so the resolver
// survives navigation + reloads. Each entry carries the three sides needed for a
// line-level (diff3) resolution; `deleted` marks a file removed upstream that was
// edited locally (resolved file-level: keep yours vs accept deletion).
export interface FileConflict {
  path: string;
  base: string;   // common ancestor (file `original` at pull time)
  mine: string;   // local edits
  theirs: string; // upstream content ("" when deleted upstream)
  deleted?: boolean;
}

interface ConflictsState {
  byProject: Record<string, FileConflict[]>;
  open: boolean; // resolver modal visible
  setConflicts: (projectId: string, list: FileConflict[]) => void;
  resolveOne: (projectId: string, path: string) => void;
  clear: (projectId: string) => void;
  setOpen: (open: boolean) => void;
}

export const useConflicts = create<ConflictsState>()(
  persist(
    (set, get) => ({
      byProject: {},
      open: false,
      setConflicts: (projectId, list) =>
        set((s) => ({ byProject: { ...s.byProject, [projectId]: list }, open: list.length > 0 })),
      resolveOne: (projectId, path) =>
        set((s) => {
          const next = (s.byProject[projectId] || []).filter((c) => c.path !== path);
          const byProject = { ...s.byProject, [projectId]: next };
          return { byProject, open: next.length > 0 ? s.open : false };
        }),
      clear: (projectId) =>
        set((s) => {
          const byProject = { ...s.byProject };
          delete byProject[projectId];
          return { byProject, open: false };
        }),
      setOpen: (open) => set({ open }),
    }),
    {
      name: "nova-conflicts",
      storage: createJSONStorage(() => idbStorage()),
      partialize: (s) => ({ byProject: s.byProject }), // not the transient `open`
    }
  )
);
