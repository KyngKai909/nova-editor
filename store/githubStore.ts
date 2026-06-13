import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAuthUser, type GitHubUser } from "@/lib/githubApi";

interface GitHubState {
  token: string | null;
  user: GitHubUser | null;
  status: "idle" | "connecting" | "error";
  error: string | null;

  // Connect with a Personal Access Token (validates by fetching the user).
  connectWithToken: (token: string) => Promise<boolean>;
  // OAuth-ready hook: a future OAuth callback sets the session the same way.
  setSession: (token: string, user: GitHubUser) => void;
  disconnect: () => void;
  clearError: () => void;
}

export const useGitHub = create<GitHubState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      status: "idle",
      error: null,

      connectWithToken: async (token) => {
        set({ status: "connecting", error: null });
        try {
          const user = await getAuthUser(token.trim());
          set({ token: token.trim(), user, status: "idle", error: null });
          return true;
        } catch (e: any) {
          set({ status: "error", error: e?.message || "Could not connect.", token: null, user: null });
          return false;
        }
      },

      setSession: (token, user) => set({ token, user, status: "idle", error: null }),
      disconnect: () => set({ token: null, user: null, status: "idle", error: null }),
      clearError: () => set({ error: null, status: "idle" }),
    }),
    {
      name: "nova-github",
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
);
