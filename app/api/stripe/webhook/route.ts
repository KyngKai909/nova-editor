import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Subscription statuses that grant Pro. Everything else (canceled, unpaid,
// incomplete_expired, …) drops the user back to Free.
const PRO_STATUSES = new Set(["active", "trialing"]);

async function setPlan(
  customerId: string,
  opts: { userId?: string; plan: "free" | "pro"; status: string | null }
) {
  const admin = supabaseAdmin();
  const patch = { plan: opts.plan, plan_status: opts.status };
  // Prefer the user id from metadata (also (re)stamps the customer id); fall
  // back to matching the previously-stored customer id.
  if (opts.userId) {
    await admin.from("profiles").update({ ...patch, stripe_customer_id: customerId }).eq("id", opts.userId);
  } else {
    await admin.from("profiles").update(patch).eq("stripe_customer_id", customerId);
  }
}

export async function POST(req: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  // The raw body is required for signature verification.
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    return NextResponse.json({ error: `Invalid signature: ${e.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id || session.client_reference_id || undefined;
        const customerId = session.customer as string;
        let status: string | null = null;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          status = sub.status;
        }
        const plan = (status && PRO_STATUSES.has(status)) || session.payment_status === "paid" ? "pro" : "free";
        await setPlan(customerId, { userId, plan, status });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await setPlan(sub.customer as string, {
          userId: sub.metadata?.user_id || undefined,
          plan: PRO_STATUSES.has(sub.status) ? "pro" : "free",
          status: sub.status,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await setPlan(sub.customer as string, {
          userId: sub.metadata?.user_id || undefined,
          plan: "free",
          status: "canceled",
        });
        break;
      }
      default:
        break;
    }
  } catch (e: any) {
    // Return 500 so Stripe retries the delivery.
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
