import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase.js";
import { syncUser } from "../../../../lib/powensSync.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Retour de la page Powens : on vérifie l'état (anti-falsification), puis on importe comptes et opérations.
export async function GET(request) {
  // Retour sur le même site que celui où l'utilisateur est connecté (même adresse que ce lien de retour).
  const url = new URL(request.url), back = new URL("/retour-banque", url.origin);
  let linkedUser = null;
  try {
    const state = url.searchParams.get("state") || "";
    if (url.searchParams.get("error")) throw new Error("Powens a refusé (" + (url.searchParams.get("error_description") || url.searchParams.get("error")) + ").");
    if (!/^[a-f0-9]{48}$/.test(state)) throw new Error("retour de Powens sans identifiant de session valide. Relancez « Connecter ma banque ».");
    const db = supabaseAdmin();
    const { data: link } = await db.from("powens_links").select("user_id").eq("pending_state", state).maybeSingle();
    // Lien déjà utilisé (rechargement, double clic…) : la banque est reliée côté Powens,
    // l'appli importera elle-même les comptes avec la session de l'utilisateur.
    if (!link) { back.searchParams.set("banque", "sync"); return NextResponse.redirect(back); }
    linkedUser = link.user_id;
    await db.from("powens_links").update({ pending_state: null }).eq("user_id", link.user_id);
    try {
      const r = await syncUser(db, link.user_id, { days: 180 });
      // Powens met parfois quelques secondes à récupérer les comptes chez la banque : l'appli réessaiera.
      if (!r.accounts) { back.searchParams.set("banque", "sync"); return NextResponse.redirect(back); }
      back.searchParams.set("banque", "ok");
      back.searchParams.set("ops", String(r.transactions || 0));
    } catch (e) {
      // La banque est bien reliée ; seul l'import a échoué (on dit pourquoi).
      console.error("[powens callback] import :", e.message);
      back.searchParams.set("banque", "partiel");
      back.searchParams.set("raison", String(e.message || "erreur inconnue").slice(0, 200));
    }
  } catch (e) {
    console.error("[powens callback]", linkedUser || "", e.message);
    back.searchParams.set("banque", "erreur");
    back.searchParams.set("raison", String(e.message || "erreur inconnue").slice(0, 200));
  }
  return NextResponse.redirect(back);
}
