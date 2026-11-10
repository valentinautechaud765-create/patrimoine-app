import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase.js";
import { lemonSignatureOk, profileFromSubscription } from "../../../../lib/lemon.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lemon Squeezy prévient ici à chaque changement d'abonnement (création, renouvellement, résiliation, expiration…).
// Signature vérifiée avec LEMONSQUEEZY_WEBHOOK_SECRET : personne d'autre ne peut changer une formule.
export async function POST(request) {
  const raw = await request.text();
  if (!lemonSignatureOk(raw, request.headers.get("x-signature"))) return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  let event;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Contenu illisible." }, { status: 400 }); }
  const name = String(event?.meta?.event_name || "");
  if (!name.startsWith("subscription_") || event?.data?.type !== "subscriptions") return NextResponse.json({ received: true, ignored: name });
  try {
    const attrs = event.data.attributes || {};
    const userId = event.meta?.custom_data?.user_id;
    const update = {
      ...profileFromSubscription(attrs),
      stripe_customer_id: "ls:" + attrs.customer_id,
      stripe_subscription_id: "ls:" + event.data.id,
    };
    const db = supabaseAdmin();
    const q = db.from("profiles").update(update);
    const { error } = await (userId ? q.eq("id", userId) : q.eq("stripe_subscription_id", "ls:" + event.data.id));
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[lemonsqueezy webhook]", e.message);
    return NextResponse.json({ error: "Traitement impossible." }, { status: 500 });
  }
}
