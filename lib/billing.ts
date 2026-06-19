import { supabase } from "@/lib/supabase";

// Client-side flag: the publishable key is the one Stripe value safe to expose,
// so its presence tells the UI whether to show billing controls. (The redirect
// flow uses Checkout's hosted page, so we never actually need the key in JS.)
export function isBillingConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
}

async function authedPost(path: string, body?: unknown): Promise<any> {
  if (!supabase) throw new Error("Billing is not configured.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in first.");
  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong.");
  return json;
}

// Start a subscription checkout (Pro by default) and redirect to Stripe.
export async function startCheckout(plan: "pro" | "studio" = "pro"): Promise<void> {
  const { url } = await authedPost("/api/stripe/checkout", { plan });
  if (url) window.location.href = url;
}

// Open the Stripe Customer Portal (for payment method / invoices).
export async function openBillingPortal(): Promise<void> {
  const { url } = await authedPost("/api/stripe/portal");
  if (url) window.location.href = url;
}

// ── in-app subscription changes (existing subscribers, no card re-entry) ──────
// Switch an existing subscription between Pro and Studio (prorated).
export async function changePlan(plan: "pro" | "studio"): Promise<void> {
  await authedPost("/api/stripe/subscription", { action: "change", plan });
}
// Cancel at period end — keeps access until the current period closes.
export async function cancelPlan(): Promise<void> {
  await authedPost("/api/stripe/subscription", { action: "cancel" });
}
// Undo a pending cancel.
export async function resumePlan(): Promise<void> {
  await authedPost("/api/stripe/subscription", { action: "resume" });
}
