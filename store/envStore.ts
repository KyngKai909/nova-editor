"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { encryptedStorage } from "@/lib/secureStorage";

// Per-project environment variables for Run/webapp mode, kept as raw .env text
// (KEY=value lines). Encrypted at rest in the browser (same AES-GCM store as the
// GitHub token) and only ever written into the local WebContainer — never sent to
// any Nova server. These are the user's own secrets for running their own app.
interface EnvState {
  byProject: Record<string, string>;
  setEnv: (projectId: string, text: string) => void;
}

export const useEnvVars = create<EnvState>()(
  persist(
    (set) => ({
      byProject: {},
      setEnv: (projectId, text) =>
        set((s) => ({ byProject: { ...s.byProject, [projectId]: text } })),
    }),
    {
      name: "nova-env",
      storage: createJSONStorage(() => encryptedStorage()),
      partialize: (s) => ({ byProject: s.byProject }),
    }
  )
);
