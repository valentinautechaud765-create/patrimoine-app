import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = { budget: true, bills: true, bank: true, investments: true, weekly: true };
export async function GET(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
    const endpoint = new URL(request.url).searchParams.get("endpoint");
    if (!endpoint) return NextResponse.json({ enabled: false, preferences: DEFAULTS });
    const { data } = await supabaseAdmin().from("push_subscriptions").select("preferences").eq("user_id", user.id).eq("endpoint", endpoint).maybeSingle();
    return NextResponse.json({ enabled: Boolean(data), preferences: data?.preferences || DEFAULTS });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
    const body = await request.json();
    const sub = body.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
    const preferences = { ...DEFAULTS, ...(body.preferences || {}) };
    const db = supabaseAdmin();
    const { error } = await db.from("push_subscriptions").upsert({
      user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, preferences, updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) throw error;
    return NextResponse.json({ ok: true, preferences });
  } catch (e) { console.error("[push subscribe]", e.message); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function PATCH(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
    const { endpoint, preferences } = await request.json();
    if (!endpoint || !preferences || typeof preferences !== "object") return NextResponse.json({ error: "Préférences invalides." }, { status: 400 });
    const safe = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, preferences[k] !== false]));
    const { error } = await supabaseAdmin().from("push_subscriptions").update({ preferences: safe, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("endpoint", endpoint);
    if (error) throw error;
    return NextResponse.json({ ok: true, preferences: safe });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function DELETE(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
    const { endpoint } = await request.json();
    if (!endpoint) return NextResponse.json({ error: "Abonnement manquant." }, { status: 400 });
    const { error } = await supabaseAdmin().from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
