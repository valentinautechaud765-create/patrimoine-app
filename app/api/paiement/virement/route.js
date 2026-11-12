import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
import { lemonConfigured } from "../../../../lib/lemon.js";
import { applyTransfers, incomingTransfers, refFor, TARIFS, virementConfigured, virementInfo } from "../../../../lib/virement.js";
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
    const { action, leger } = await request.json().catch(() => ({}));
    const ref = refFor(user.id);
    if (action === "info") return NextResponse.json({ ...virementInfo(), ref, tarifs: TARIFS, carte: lemonConfigured() || Boolean(process.env.STRIPE_SECRET_KEY) });

    const db = supabaseAdmin();
    // « léger » : vérification automatique à l'ouverture de l'appli (sans redemander à la banque).
    const r = await applyTransfers(db, user.id, await incomingTransfers(db, { refresh: !leger }));
    if (!r.count) return NextResponse.json({ found: false, ref });
    return NextResponse.json({ found: true, active: r.active, plan: r.plan, end: r.end, payments: r.count });
  } catch (e) {
    console.error("[virement]", e.message);
    return NextResponse.json({ error: e.message || "Vérification impossible pour le moment." }, { status: 500 });
  }
}
