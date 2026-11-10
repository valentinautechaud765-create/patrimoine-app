// Paiement des abonnements avec Lemon Squeezy (vendeur officiel à la place de Valentin, en attendant un SIRET pour Stripe).
// Lemon Squeezy encaisse, gère la TVA, puis reverse l'argent. Activé dès que LEMONSQUEEZY_API_KEY est défini sur Vercel ;
// sinon l'appli continue d'utiliser Stripe.
//
// Variables sur Vercel :
//   LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_WEBHOOK_SECRET,
//   LEMONSQUEEZY_VARIANT_PLUS_MONTHLY, LEMONSQUEEZY_VARIANT_PLUS_YEARLY,
//   LEMONSQUEEZY_VARIANT_PRO_MONTHLY,  LEMONSQUEEZY_VARIANT_PRO_YEARLY
//
// Sans changer la base : les identifiants Lemon Squeezy sont rangés dans les colonnes existantes
// stripe_customer_id / stripe_subscription_id, préfixés par « ls: ».
import crypto from "node:crypto";

const API = "https://api.lemonsqueezy.com/v1";
export const lemonConfigured = () => Boolean(String(process.env.LEMONSQUEEZY_API_KEY || "").trim());
export const isLemonId = (v) => String(v || "").startsWith("ls:");
export const lsId = (v) => String(v || "").replace(/^ls:/, "");

async function ls(path, options = {}) {
  const key = String(process.env.LEMONSQUEEZY_API_KEY || "").trim();
  if (!key) throw new Error("Lemon Squeezy n’est pas configuré (LEMONSQUEEZY_API_KEY).");
  const r = await fetch(API + path, {
    ...options,
    headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: "Bearer " + key, ...(options.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Lemon Squeezy : " + (j.errors?.[0]?.detail || j.errors?.[0]?.title || `erreur ${r.status}`));
  return j;
}

export function variantId(plan, billing) {
  const key = `LEMONSQUEEZY_VARIANT_${String(plan).toUpperCase()}_${billing === "monthly" ? "MONTHLY" : "YEARLY"}`;
  const id = String(process.env[key] || "").trim();
  if (!id) throw new Error(`Formule Lemon Squeezy manquante : ${key}.`);
  return id;
}
export function planFromVariant(variant) {
  const v = String(variant ?? "");
  for (const plan of ["plus", "pro"]) for (const b of ["MONTHLY", "YEARLY"]) if (String(process.env[`LEMONSQUEEZY_VARIANT_${plan.toUpperCase()}_${b}`] || "").trim() === v) return plan;
  return null;
}

// Page de paiement Lemon Squeezy pour cette formule, rattachée au compte Patrimo (custom.user_id).
export async function lemonCheckout({ user, plan, billing, redirectUrl }) {
  const store = String(process.env.LEMONSQUEEZY_STORE_ID || "").trim();
  if (!store) throw new Error("Lemon Squeezy n’est pas configuré (LEMONSQUEEZY_STORE_ID).");
  const variant = variantId(plan, billing);
  const j = await ls("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: { redirect_url: redirectUrl, enabled_variants: [Number(variant)] },
          checkout_options: { locale: "fr", skip_trial: true, button_color: "#3d7cff" },
          checkout_data: { email: user.email || undefined, custom: { user_id: user.id } },
        },
        relationships: {
          store: { data: { type: "stores", id: store } },
          variant: { data: { type: "variants", id: variant } },
        },
      },
    }),
  });
  const url = j.data?.attributes?.url;
  if (!url) throw new Error("Lemon Squeezy n’a pas renvoyé de page de paiement.");
  return url;
}

// Espace client (changer de carte, de formule, résilier) : lien signé valable 24 h.
export async function lemonPortal(subscriptionId) {
  const j = await ls("/subscriptions/" + encodeURIComponent(lsId(subscriptionId)));
  const url = j.data?.attributes?.urls?.customer_portal;
  if (!url) throw new Error("Espace client Lemon Squeezy indisponible.");
  return url;
}

// Vérifie la signature X-Signature (HMAC SHA-256 en hexadécimal du corps brut).
export function lemonSignatureOk(rawBody, signature) {
  const secret = String(process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "").trim();
  if (!secret || !signature) return false;
  const digest = Buffer.from(crypto.createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");
  const sig = Buffer.from(String(signature), "utf8");
  return digest.length === sig.length && crypto.timingSafeEqual(digest, sig);
}

// Abonnement Lemon Squeezy → ce qu'on enregistre dans le profil Patrimo.
// Résilié (« cancelled ») : l'accès continue jusqu'à la fin de la période payée (ends_at).
export function profileFromSubscription(attrs = {}, now = Date.now()) {
  const status = String(attrs.status || "");
  const plan = planFromVariant(attrs.variant_id);
  const endsAt = attrs.ends_at ? new Date(attrs.ends_at).getTime() : null;
  const stillPaid = ["active", "on_trial", "past_due"].includes(status) || (status === "cancelled" && endsAt && endsAt > now);
  const mapped = { active: "active", on_trial: "trialing", past_due: "past_due", cancelled: "active" }[status] || status || null;
  return {
    plan: stillPaid && plan ? plan : "free",
    plan_status: stillPaid && plan ? mapped : status || "expired",
    current_period_end: status === "cancelled" ? attrs.ends_at || null : attrs.renews_at || attrs.ends_at || null,
  };
}
