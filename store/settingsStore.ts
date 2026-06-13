import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  // display name of the workspace folder where new projects are saved (the
  // actual directory handle lives in IndexedDB under "__workspace__")
  workspaceName: string | null;
  autoSaveToDisk: boolean;
  styleAsClasses: boolean; // emit Tailwind classes for Tailwind projects

  setWorkspaceName: (name: string | null) => void;
  setAutoSaveToDisk: (v: boolean) => void;
  setStyleAsClasses: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      workspaceName: null,
      autoSaveToDisk: true,
      styleAsClasses: true,
      setWorkspaceName: (name) => set({ workspaceName: name }),
      setAutoSaveToDisk: (v) => set({ autoSaveToDisk: v }),
      setStyleAsClasses: (v) => set({ styleAsClasses: v }),
    }),
    { name: "nova-settings" }
  )
);
