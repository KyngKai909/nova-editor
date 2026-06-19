import { NextResponse } from "next/server";
import { stripe, isStripeConfigured, STRIPE_PRICE_ID, STRIPE_STUDIO_PRICE_ID } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a Stripe Checkout Session for the signed-in user and return its URL.
export async function POST(req: Request) {
  if (!stripe || !isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  // Which plan to subscribe to (defaults to Pro).
  const reqBody = await req.json().catch(() => ({}));
  const wantsStudio = reqBody?.plan === "studio";
  const priceId = wantsStudio ? STRIPE_STUDIO_PRICE_ID : STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: `${wantsStudio ? "Studio" : "Pro"} plan is not configured.` }, { status: 503 });
  }

  try {
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    // Reuse the user's Stripe customer, or create one and remember it.
    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const origin = req.headers.get("origin") || new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      // Carry the user id onto the subscription so later webhook events resolve it.
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${origin}/settings?billing=success`,
      cancel_url: `${origin}/settings?billing=cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    // Surface the real reason (bad/wrong-mode price id, Stripe outage, etc.)
    console.error("stripe checkout error:", e?.message);
    return NextResponse.json({ error: e?.message || "Could not start checkout." }, { status: 500 });
  }
}
