import { NextResponse } from "next/server";
import { stripe, planFromPrice } from "../../../../lib/stripe.js";
import { supabaseAdmin } from "../../../../lib/supabase.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe prévient ici à chaque changement d'abonnement : la formule du compte est mise à jour.
// Signature vérifiée avec STRIPE_WEBHOOK_SECRET : personne d'autre ne peut appeler cette adresse.
export async function POST(request) {
  const body = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }
  try {
    const db = supabaseAdmin();
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object;
      const active = ["active", "trialing", "past_due"].includes(sub.status) && event.type !== "customer.subscription.deleted";
      const plan = active ? planFromPrice(sub.items?.data?.[0]?.price?.id) : "free";
      const update = { plan, plan_status: sub.status, stripe_subscription_id: sub.id, current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null };
      if (sub.status === "trialing") update.trial_used = true;
      const userId = sub.metadata?.user_id;
      const q = db.from("profiles").update(update);
      await (userId ? q.eq("id", userId) : q.eq("stripe_customer_id", sub.customer));
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", e.message);
    return NextResponse.json({ error: "Traitement impossible." }, { status: 500 });
  }
}
