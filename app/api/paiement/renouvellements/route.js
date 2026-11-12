import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase.js";
import { applyTransfers, incomingTransfers, virementConfigured } from "../../../../lib/virement.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Chaque jour (vercel.json) : pour les clients payés par virement dont l'accès se termine bientôt ou vient de se terminer,
// on regarde si un nouveau virement (virement permanent ou manuel) est arrivé, et on prolonge l'accès tout seul.
// Sans nouveau virement, rien n'est fait : l'accès se ferme à la date prévue.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!virementConfigured()) return NextResponse.json({ ok: true, skipped: "virement non configuré" });
  const db = supabaseAdmin();
  const soon = new Date(Date.now() + 3 * 864e5).toISOString(), since = new Date(Date.now() - 60 * 864e5).toISOString();
  const { data: users, error } = await db.from("profiles").select("id").eq("plan_status", "virement").lte("current_period_end", soon).gte("current_period_end", since);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!users?.length) return NextResponse.json({ ok: true, checked: 0 });
  const transfers = await incomingTransfers(db, { refresh: true });
  let renewed = 0;
  for (const u of users) {
    try { const r = await applyTransfers(db, u.id, transfers); if (r.active) renewed++; } catch (e) { console.warn("[renouvellements]", u.id, e.message); }
  }
  return NextResponse.json({ ok: true, checked: users.length, renewed });
}
