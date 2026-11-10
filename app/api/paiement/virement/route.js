import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
import { lemonConfigured } from "../../../../lib/lemon.js";
import { accessFromTransfers, incomingTransfers, refFor, TARIFS, virementConfigured, virementInfo } from "../../../../lib/virement.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Paiement par virement :
//   POST { action: "info" }      → IBAN, titulaire, code de virement du client, montants
//   POST { action: "verifier" }  → cherche les virements reçus avec ce code et ouvre l'accès s'ils sont là
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
    if (!virementConfigured()) return NextResponse.json({ error: "Le paiement par virement n’est pas encore activé." }, { status: 503 });
    const { action } = await request.json().catch(() => ({}));
    const ref = refFor(user.id);
    if (action === "info") return NextResponse.json({ ...virementInfo(), ref, tarifs: TARIFS, carte: lemonConfigured() || Boolean(process.env.STRIPE_SECRET_KEY) });

    const db = supabaseAdmin();
    const transfers = await incomingTransfers(db, { refresh: true });
    const r = accessFromTransfers(transfers, ref);
    if (!r.count) return NextResponse.json({ found: false, ref });
    const active = r.end && new Date(r.end).getTime() > Date.now();
    if (active) {
      const { error } = await db.from("profiles").update({ plan: r.plan, plan_status: "virement", current_period_end: r.end, stripe_subscription_id: "vir:" + r.last.id }).eq("id", user.id);
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ found: true, active, plan: r.plan, end: r.end, payments: r.count });
  } catch (e) {
    console.error("[virement]", e.message);
    return NextResponse.json({ error: e.message || "Vérification impossible pour le moment." }, { status: 500 });
  }
}
