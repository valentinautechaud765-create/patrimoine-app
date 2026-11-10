import { NextResponse } from "next/server";
import { stripe, priceId, siteUrl } from "../../../../lib/stripe.js";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Crée une page de paiement Stripe pour la formule choisie. L'essai gratuit est déjà donné par l'appli
// (3 jours après l'inscription, sans carte) : l'abonnement démarre donc tout de suite.
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnecte-toi." }, { status: 401 });
    const { plan, billing } = await request.json();
    if (!["plus", "pro"].includes(plan)) return NextResponse.json({ error: "Formule inconnue." }, { status: 400 });
    const db = supabaseAdmin(), s = stripe();
    const { data: profile } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
    let customer = profile?.stripe_customer_id;
    if (!customer) {
      customer = (await s.customers.create({ email: user.email, metadata: { user_id: user.id } })).id;
      await db.from("profiles").upsert({ id: user.id, stripe_customer_id: customer });
    }
    const base = siteUrl(request);
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: priceId(plan, billing), quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      locale: "fr",
      success_url: `${base}/app?paiement=ok`,
      cancel_url: `${base}/app`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[stripe checkout]", e.message);
    return NextResponse.json({ error: e.message || "Paiement indisponible." }, { status: 500 });
  }
}
