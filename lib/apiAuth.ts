import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Verify the Supabase access token sent by the client as a Bearer header and
// return the authenticated user, or null. Server-only (uses the admin client).
export async function getUserFromRequest(
  req: Request
): Promise<{ id: string; email: string | null } | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
