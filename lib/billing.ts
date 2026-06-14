import { supabase } from "@/lib/supabase";

// Client-side flag: the publishable key is the one Stripe value safe to expose,
// so its presence tells the UI whether to show billing controls. (The redirect
// flow uses Checkout's hosted page, so we never actually need the key in JS.)
export function isBillingConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
}

async function authedPost(path: string): Promise<{ url?: string }> {
  if (!supabase) throw new Error("Billing is not configured.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in first.");
  const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong.");
  return json;
}

// Start a subscription checkout and redirect to Stripe's hosted page.
export async function startCheckout(): Promise<void> {
  const { url } = await authedPost("/api/stripe/checkout");
  if (url) window.location.href = url;
}

// Open the Stripe Customer Portal to manage or cancel the subscription.
export async function openBillingPortal(): Promise<void> {
  const { url } = await authedPost("/api/stripe/portal");
  if (url) window.location.href = url;
}
