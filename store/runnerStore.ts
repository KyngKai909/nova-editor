"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { encryptedStorage } from "@/lib/secureStorage";

// Pairing token for the local runner companion agent. Encrypted at rest (same
// AES-GCM store as the GitHub token); only ever sent to 127.0.0.1, never a server.
// Where Run ▶ executes: "browser" = in-tab WebContainer (default, zero-install);
// "local" = the native companion agent (full compute, needs the agent paired).
export type Runtime = "browser" | "local";

interface RunnerState {
  token: string;
  setToken: (token: string) => void;
  runtime: Runtime;
  setRuntime: (r: Runtime) => void;
}

export const useRunner = create<RunnerState>()(
  persist(
    (set) => ({
      token: "",
      setToken: (token) => set({ token: token.trim() }),
      runtime: "browser",
      setRuntime: (runtime) => set({ runtime }),
    }),
    {
      name: "nova-runner",
      storage: createJSONStorage(() => encryptedStorage()),
      partialize: (s) => ({ token: s.token, runtime: s.runtime }),
    }
  )
);
