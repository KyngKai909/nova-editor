"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { encryptedStorage } from "@/lib/secureStorage";

// Pairing token for the local runner companion agent. Encrypted at rest (same
// AES-GCM store as the GitHub token); only ever sent to 127.0.0.1, never a server.
interface RunnerState {
  token: string;
  setToken: (token: string) => void;
}

export const useRunner = create<RunnerState>()(
  persist(
    (set) => ({
      token: "",
      setToken: (token) => set({ token: token.trim() }),
    }),
    {
      name: "nova-runner",
      storage: createJSONStorage(() => encryptedStorage()),
      partialize: (s) => ({ token: s.token }),
    }
  )
);
