import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase.js";
import { syncUser } from "../../../../lib/powensSync.js";
import { syncAndAlert } from "../../../../lib/bankAlerts.js";
import { accessFor } from "../../../../lib/config.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Powens prévient ici quand une banque vient d'être synchronisée (événement CONNECTION_SYNCED, à déclarer
// dans la console Powens → Webhooks). On ne se fie pas au contenu reçu : on relance notre propre synchronisation
// pour cet utilisateur (avec son jeton chiffré), puis on envoie l'alerte des nouvelles opérations.
// Si POWENS_WEBHOOK_SECRET est défini sur Vercel, l'adresse doit se terminer par ?cle=<ce secret>.
export async function POST(request) {
  const secret = String(process.env.POWENS_WEBHOOK_SECRET || "").trim();
  if (secret && new URL(request.url).searchParams.get("cle") !== secret) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const powensUser = String(body?.user?.id ?? body?.id_user ?? body?.connection?.id_user ?? body?.connection?.user?.id ?? "").trim();
  if (!powensUser) return NextResponse.json({ ok: true, ignored: "utilisateur absent" });
  try {
    const db = supabaseAdmin();
    const { data: link } = await db.from("powens_links").select("user_id,last_sync").eq("powens_user_id", powensUser).maybeSingle();
    if (!link) return NextResponse.json({ ok: true, ignored: "utilisateur inconnu" });
    if (link.last_sync && Date.now() - new Date(link.last_sync).getTime() < 60e3) return NextResponse.json({ ok: true, skipped: "synchro récente" });
    const { data: profile } = await db.from("profiles").select("plan,plan_status,created_at").eq("id", link.user_id).maybeSingle();
    if (accessFor(profile || {}).locked) return NextResponse.json({ ok: true, skipped: "essai terminé" });
    const r = await syncAndAlert(db, link.user_id, syncUser);
    return NextResponse.json({ ok: true, transactions: r.transactions || 0, notified: r.notified || 0 });
  } catch (e) {
    console.error("[powens webhook]", e.message);
    return NextResponse.json({ ok: false, error: e.message });
  }
}
