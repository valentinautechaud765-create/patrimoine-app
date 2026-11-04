import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "../../../lib/supabase.js";
import { OWNER_EMAILS } from "../../../lib/config.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Appelé à l'ouverture de l'appli : donne l'accès complet au propriétaire.
// L'identité est vérifiée par Supabase (jeton de session) et l'adresse doit être confirmée :
// personne d'autre ne peut obtenir cet accès, même en connaissant l'adresse.
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
    const owner = OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) && Boolean(user.email_confirmed_at);
    if (!owner) return NextResponse.json({ owner: false, reason: user.email_confirmed_at ? "not_owner" : "email_not_confirmed" });
    const db = supabaseAdmin();
    const { data: profile } = await db.from("profiles").select("plan,plan_status").eq("id", user.id).maybeSingle();
    if (profile?.plan !== "pro" || profile?.plan_status !== "active") {
      const { error } = await db.from("profiles").upsert({ id: user.id, plan: "pro", plan_status: "active" });
      if (error) throw error;
    }
    return NextResponse.json({ owner: true, plan: "pro", plan_status: "active" });
  } catch (e) {
    console.error("[compte]", e.message);
    return NextResponse.json({ error: "Vérification impossible : " + e.message }, { status: 500 });
  }
}
