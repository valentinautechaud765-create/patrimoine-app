import Stripe from "stripe";

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe n’est pas encore configuré (STRIPE_SECRET_KEY).");
  return new Stripe(key);
}
// Correspondance formule ↔ identifiant de prix Stripe (renseignés dans les variables d'environnement).
export function priceId(plan, billing) {
  const key = `STRIPE_PRICE_${String(plan).toUpperCase()}_${billing === "monthly" ? "MONTHLY" : "YEARLY"}`;
  const id = process.env[key];
  if (!id) throw new Error(`Prix Stripe manquant : ${key}.`);
  return id;
}
export function planFromPrice(price) {
  for (const plan of ["plus", "pro"]) for (const b of ["MONTHLY", "YEARLY"]) if (process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${b}`] === price) return plan;
  return "free";
}
export const siteUrl = (request) => process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
