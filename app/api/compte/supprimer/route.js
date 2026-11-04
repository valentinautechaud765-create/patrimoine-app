import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
import { stripe } from "../../../../lib/stripe.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Suppression définitive du compte (droit à l'effacement, RGPD).
// L'abonnement Stripe éventuel est résilié, puis l'utilisateur et toutes ses données sont effacés
// (les tables sont liées à l'utilisateur avec « on delete cascade »).
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
    const db = supabaseAdmin();
    const { data: profile } = await db.from("profiles").select("stripe_subscription_id").eq("id", user.id).maybeSingle();
    if (profile?.stripe_subscription_id) {
      try { await stripe().subscriptions.cancel(profile.stripe_subscription_id); } catch (e) { console.error("[suppression] stripe", e.message); }
    }
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[suppression]", e.message);
    return NextResponse.json({ error: "Suppression impossible pour le moment. Écrivez-nous et nous le ferons à la main." }, { status: 500 });
  }
}
