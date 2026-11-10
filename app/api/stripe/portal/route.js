import { NextResponse } from "next/server";
import { stripe, siteUrl } from "../../../../lib/stripe.js";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
import { isLemonId, lemonPortal } from "../../../../lib/lemon.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Espace client Stripe : changer de formule, moyen de paiement, factures, résiliation.
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnecte-toi." }, { status: 401 });
    const { data: profile } = await supabaseAdmin().from("profiles").select("stripe_customer_id,stripe_subscription_id").eq("id", user.id).maybeSingle();
    if (!profile?.stripe_customer_id) return NextResponse.json({ error: "Aucun abonnement trouvé." }, { status: 404 });
    // Abonnement pris avec Lemon Squeezy : son propre espace client.
    if (isLemonId(profile.stripe_subscription_id)) return NextResponse.json({ url: await lemonPortal(profile.stripe_subscription_id) });
    const session = await stripe().billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: `${siteUrl(request)}/app`, locale: "fr" });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[stripe portal]", e.message);
    return NextResponse.json({ error: e.message || "Espace client indisponible." }, { status: 500 });
  }
}
