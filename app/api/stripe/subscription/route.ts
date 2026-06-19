import { NextResponse } from "next/server";
import { stripe, isStripeConfigured, STRIPE_PRICE_ID, STRIPE_STUDIO_PRICE_ID, planForPrice } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manage an EXISTING subscription from custom in-app modals (no Stripe-hosted
// page, no card re-entry): switch plan (Pro ⇄ Studio), cancel at period end, or
// resume a pending cancel. New subscriptions still go through Checkout. The
// webhook is the source of truth; we also write the profile here for instant UI.
export async function POST(req: Request) {
  if (!stripe || !isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action as "change" | "cancel" | "resume";

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  const customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) return NextResponse.json({ error: "No billing account yet.", needsCheckout: true }, { status: 400 });

  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  const sub = subs.data.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status));
  if (!sub) return NextResponse.json({ error: "No active subscription.", needsCheckout: true }, { status: 400 });

  try {
    if (action === "cancel") {
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      await admin.from("profiles").update({ plan_status: "canceling" }).eq("id", user.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "resume") {
      const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
      await admin.from("profiles").update({ plan_status: updated.status }).eq("id", user.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "change") {
      const plan = body?.plan as "pro" | "studio";
      const priceId = plan === "studio" ? STRIPE_STUDIO_PRICE_ID : STRIPE_PRICE_ID;
      if (!priceId) return NextResponse.json({ error: `${plan} plan is not configured.` }, { status: 503 });
      const itemId = sub.items.data[0]?.id;
      const updated = await stripe.subscriptions.update(sub.id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false, // switching plans clears any pending cancel
        metadata: { user_id: user.id },
      });
      await admin.from("profiles").update({ plan: planForPrice(priceId), plan_status: updated.status }).eq("id", user.id);
      return NextResponse.json({ ok: true, plan: planForPrice(priceId) });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Subscription update failed." }, { status: 500 });
  }
}
