import Stripe from "stripe";

// Stripe is OPTIONAL and SERVER-ONLY. Until the env vars below are set in
// Vercel, billing is simply off and the rest of the app is unaffected.
// NEVER import this from a client component — STRIPE_SECRET_KEY must never
// reach the browser.
const secret = process.env.STRIPE_SECRET_KEY;

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export function isStripeConfigured(): boolean {
  return !!(secret && STRIPE_PRICE_ID);
}

// Pin to the SDK's bundled API version (omitting apiVersion) so upgrades are
// explicit. appInfo just tags requests in the Stripe dashboard.
export const stripe: Stripe | null = secret
  ? new Stripe(secret, { appInfo: { name: "Nova", url: "https://nova-editor-six.vercel.app" } })
  : null;
