import Stripe from "stripe";

// Stripe is OPTIONAL and SERVER-ONLY. Until the env vars below are set in
// Vercel, billing is simply off and the rest of the app is unaffected.
// NEVER import this from a client component — STRIPE_SECRET_KEY must never
// reach the browser.
const secret = process.env.STRIPE_SECRET_KEY;

// Pro price — prefer the symmetric STRIPE_PRO_PRICE_ID, fall back to the legacy name.
export const STRIPE_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || process.env.STRIPE_PRICE_ID;
export const STRIPE_STUDIO_PRICE_ID = process.env.STRIPE_STUDIO_PRICE_ID; // Studio
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export function isStripeConfigured(): boolean {
  return !!(secret && STRIPE_PRICE_ID);
}

// Map a Stripe price id to the plan it grants.
export function planForPrice(priceId: string | undefined | null): "pro" | "studio" {
  return priceId && STRIPE_STUDIO_PRICE_ID && priceId === STRIPE_STUDIO_PRICE_ID ? "studio" : "pro";
}

// Pin to the SDK's bundled API version (omitting apiVersion) so upgrades are
// explicit. appInfo just tags requests in the Stripe dashboard.
export const stripe: Stripe | null = secret
  ? new Stripe(secret, { appInfo: { name: "Nova", url: "https://novaeditor.org" } })
  : null;
