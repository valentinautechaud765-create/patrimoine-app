import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
import { sendPush } from "../../../../lib/push.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
    const { endpoint } = await request.json();
    const { data, error } = await supabaseAdmin().from("push_subscriptions").select("*").eq("user_id", user.id).eq("endpoint", endpoint).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Active d'abord les notifications sur cet appareil." }, { status: 404 });
    const result = await sendPush(data, { title: "Patrimo", body: "Les notifications sont bien activées sur cet appareil. Tu recevras les alertes importantes ici.", url: "/", tag: "patrimo-test" });
    if (result.expired) {
      await supabaseAdmin().from("push_subscriptions").delete().eq("id", data.id);
      return NextResponse.json({ error: "Cet abonnement a expiré. Réactive les notifications." }, { status: 410 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) { console.error("[push test]", e.message); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
