import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase is OPTIONAL: until NEXT_PUBLIC_SUPABASE_URL + _ANON_KEY are set in
// the environment, the app runs exactly as before (no accounts, no gate) — so
// adding this never disrupts the live alpha. Flip it on by adding the two env
// vars in Vercel and redeploying.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return !!(url && anon);
}

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(url!, anon!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // completes the magic-link sign-in on redirect
        flowType: "pkce",
      },
    })
  : null;
