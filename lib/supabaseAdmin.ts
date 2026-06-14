import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SERVER-ONLY service-role client. It bypasses RLS, so it must only ever run
// in API routes / server code — never import this from a client component.
// SUPABASE_SERVICE_ROLE_KEY is the Supabase *secret* key (Vercel env only).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isAdminConfigured(): boolean {
  return !!(url && serviceKey);
}

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!url || !serviceKey) throw new Error("Supabase service role is not configured.");
  if (!cached) {
    cached = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
