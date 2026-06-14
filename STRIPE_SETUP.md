# Stripe billing setup

Billing is **off** until the env vars below are set, so nothing here affects the
live app until you turn it on. The paid feature is **Pro** ($8/mo) — cloud
backup + real-time project sync (`profiles.plan` flips to `'pro'`).

## 1. Create the product + price in Stripe

1. Stripe Dashboard → **Product catalog → Add product**.
2. Name it (e.g. "Nova Pro"), add a **recurring** price of **$8 / month**.
3. Copy the **Price ID** (`price_…`). → this is `STRIPE_PRICE_ID`.

## 2. Get your API keys

Stripe Dashboard → **Developers → API keys**:

- **Secret key** (`sk_live_…` / `sk_test_…`) → `STRIPE_SECRET_KEY`
- **Publishable key** (`pk_live_…` / `pk_test_…`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## 3. Add the webhook endpoint

Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- **Endpoint URL:** `https://nova-editor-six.vercel.app/api/stripe/webhook`
- **Events to send:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- After creating it, copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`

## 4. Supabase service-role key (for the webhook to update plans)

Supabase Dashboard → **Project Settings → API → Project API keys → `service_role`**
(the **secret** one). → `SUPABASE_SERVICE_ROLE_KEY`.

> ⚠️ This key bypasses RLS. It is used **only** in server API routes and must
> NEVER be exposed to the browser or committed. Vercel env only.

## 5. Add the env vars in Vercel

**Project → Settings → Environment Variables** (Production + Preview):

| Variable | Value | Exposed to browser? |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_…` | no |
| `STRIPE_PRICE_ID` | `price_…` | no |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` secret | no |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_…` | yes (publishable, safe) |

Redeploy after adding them. The "Upgrade to Pro" button appears in
**Settings → Account** once `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is present.

## How it flows

1. User clicks **Upgrade — $8/mo** → `POST /api/stripe/checkout` creates a
   Checkout Session (creating/reusing their Stripe customer) → redirect to
   Stripe's hosted page.
2. On payment, Stripe redirects to `/settings?billing=success` and fires
   `checkout.session.completed` → `POST /api/stripe/webhook` verifies the
   signature and sets `profiles.plan = 'pro'`.
3. Settings polls the profile until it flips, then shows **Pro**.
4. **Manage** → `POST /api/stripe/portal` opens the Stripe Customer Portal to
   change or cancel. Subscription changes/cancellations come back through the
   same webhook (`customer.subscription.updated` / `.deleted`) and flip the plan.

## Local testing (optional)

```bash
stripe login
stripe listen --forward-to localhost:3011/api/stripe/webhook
# use the whsec_ it prints as STRIPE_WEBHOOK_SECRET in .env.local
stripe trigger checkout.session.completed
```
