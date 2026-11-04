import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase.js";
import { siteUrl } from "../../../../lib/stripe.js";
import { syncUser } from "../../../../lib/powensSync.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Retour de la page Powens : on vérifie l'état (anti-falsification), puis on importe comptes et opérations.
export async function GET(request) {
  const url = new URL(request.url), back = new URL("/app", siteUrl(request));
  try {
    const state = url.searchParams.get("state") || "";
    if (!/^[a-f0-9]{48}$/.test(state)) throw new Error("état invalide");
    if (url.searchParams.get("error")) throw new Error("refus : " + url.searchParams.get("error"));
    const db = supabaseAdmin();
    const { data: link } = await db.from("powens_links").select("user_id").eq("pending_state", state).maybeSingle();
    if (!link) throw new Error("tentative expirée");
    await db.from("powens_links").update({ pending_state: null }).eq("user_id", link.user_id);
    const r = await syncUser(db, link.user_id, { days: 180 });
    back.searchParams.set("banque", "ok");
    back.searchParams.set("ops", String(r.transactions || 0));
  } catch (e) {
    console.error("[powens callback]", e.message);
    back.searchParams.set("banque", "erreur");
  }
  return NextResponse.redirect(back);
}
