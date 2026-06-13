"use client";

import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface Profile {
  id: string;
  email: string | null;
  invites_remaining: number;
  activated: boolean;
  is_admin: boolean;
  plan: string;
  plan_status: string | null;
}

interface AuthState {
  ready: boolean; // initial session check complete
  signedIn: boolean;
  email: string | null;
  profile: Profile | null;

  init: () => void;
  checkInvite: (code: string) => Promise<boolean>;
  sendMagicLink: (email: string, inviteCode: string) => Promise<{ error?: string }>;
  redeemInvite: (code: string) => Promise<boolean>;
  generateInvite: () => Promise<{ code?: string; error?: string }>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

let initialized = false;

export const useAuth = create<AuthState>((set, get) => ({
  ready: !isSupabaseConfigured(), // if Supabase is off, we're "ready" with no auth
  signedIn: false,
  email: null,
  profile: null,

  init: () => {
    if (initialized || !supabase) return;
    initialized = true;
    const apply = async (session: any) => {
      const email = session?.user?.email ?? null;
      set({ signedIn: !!session, email });
      if (session) await get().refreshProfile();
      else set({ profile: null });
    };
    supabase.auth.getSession().then(async ({ data }) => {
      await apply(data.session);
      set({ ready: true });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });
  },

  refreshProfile: async () => {
    if (!supabase) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      set({ profile: null });
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
    if (data) set({ profile: data as Profile });
  },

  checkInvite: async (code) => {
    if (!supabase) return false;
    const { data } = await supabase.rpc("check_invite", { p_code: code.trim() });
    return data === true;
  },

  sendMagicLink: async (email, inviteCode) => {
    if (!supabase) return { error: "Auth is not configured." };
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        data: { invite_code: inviteCode.trim() },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined,
      },
    });
    return { error: error?.message };
  },

  redeemInvite: async (code) => {
    if (!supabase) return false;
    const { data } = await supabase.rpc("redeem_invite", { p_code: code.trim() });
    if (data === true) await get().refreshProfile();
    return data === true;
  },

  generateInvite: async () => {
    if (!supabase) return { error: "Auth is not configured." };
    const { data, error } = await supabase.rpc("generate_invite");
    if (error) return { error: error.message };
    await get().refreshProfile();
    return { code: data as string };
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ signedIn: false, email: null, profile: null });
  },
}));
