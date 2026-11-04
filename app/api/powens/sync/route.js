import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
import { syncUser } from "../../../../lib/powensSync.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Resynchronisation à la demande (bouton) ou à l'ouverture de l'appli (au plus toutes les 30 min, sauf si forcée).
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
    const { force } = await request.json().catch(() => ({}));
    const db = supabaseAdmin();
    const { data: link } = await db.from("powens_links").select("last_sync").eq("user_id", user.id).maybeSingle();
    if (!link) return NextResponse.json({ linked: false });
    if (!force && link.last_sync && Date.now() - new Date(link.last_sync).getTime() < 30 * 60e3) return NextResponse.json({ linked: true, skipped: true, at: link.last_sync });
    return NextResponse.json(await syncUser(db, user.id));
  } catch (e) {
    console.error("[powens sync]", e.message);
    return NextResponse.json({ error: /configur/i.test(e.message) ? e.message : "Synchronisation bancaire momentanément indisponible." }, { status: 500 });
  }
}
