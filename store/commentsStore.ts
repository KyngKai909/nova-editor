import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idbKv";

export interface Comment {
  id: string;
  projectId: string;
  elementId: string;     // data-wfc-id of the anchored element
  elementLabel: string;  // tag / text snapshot, for the panel
  body: string;
  author: string;        // "You" locally; an email once collaboration lands
  resolved: boolean;
  createdAt: number;
  x?: number;            // 0–1 click position within the element (right-click)
  y?: number;
}

// Where a not-yet-written comment is being placed (from a right-click).
export interface PendingAnchor {
  elementId: string;
  label: string;
  x?: number;
  y?: number;
}

interface CommentsState {
  byProject: Record<string, Comment[]>;
  // UI state (not persisted as document data): whether the Comments tab is open
  // (drives the canvas pin overlay), which comment is focused, and a pending
  // right-click anchor the composer should use.
  panelOpen: boolean;
  focusedId: string | null;
  pending: PendingAnchor | null;

  forProject: (projectId: string | null) => Comment[];
  add: (projectId: string, elementId: string, elementLabel: string, body: string, x?: number, y?: number) => void;
  toggleResolved: (projectId: string, id: string) => void;
  remove: (projectId: string, id: string) => void;
  setPanelOpen: (open: boolean) => void;
  setFocused: (id: string | null) => void;
  setPending: (a: PendingAnchor | null) => void;
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const useComments = create<CommentsState>()(
  persist(
    (set, get) => ({
      byProject: {},
      panelOpen: false,
      focusedId: null,
      pending: null,

      forProject: (projectId) => (projectId ? get().byProject[projectId] || [] : []),

      add: (projectId, elementId, elementLabel, body, x, y) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: [
              ...(s.byProject[projectId] || []),
              { id: uid(), projectId, elementId, elementLabel, body, author: "You", resolved: false, createdAt: Date.now(), x, y },
            ],
          },
        })),

      toggleResolved: (projectId, id) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: (s.byProject[projectId] || []).map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)),
          },
        })),

      remove: (projectId, id) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: (s.byProject[projectId] || []).filter((c) => c.id !== id),
          },
        })),

      setPanelOpen: (open) => set({ panelOpen: open }),
      setFocused: (id) => set({ focusedId: id }),
      setPending: (a) => set({ pending: a }),
    }),
    {
      name: "nova-comments",
      storage: createJSONStorage(() => idbStorage()),
      // persist only the comment data, not the transient UI state
      partialize: (s) => ({ byProject: s.byProject }),
    }
  )
);
