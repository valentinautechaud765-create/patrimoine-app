import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { powensConfig, encrypt, decrypt } from "../../../../lib/powens.js";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
import { siteUrl } from "../../../../lib/stripe.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ouvre la page Powens (agréée ACPR) où l'utilisateur choisit sa banque et se connecte.
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnecte-toi." }, { status: 401 });
    const db = supabaseAdmin();
    const [{ data: profile }, { count }] = await Promise.all([
      db.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
      db.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    if ((profile?.plan || "free") === "free" && (count || 0) >= 1) return NextResponse.json({ error: "La formule gratuite inclut 1 compte. Passe à Plus pour en connecter d’autres." }, { status: 402 });
    const { domain, clientId, secret, api } = powensConfig();
    // Un utilisateur Powens par compte Patrimo, réutilisé pour les connexions suivantes.
    const { data: link } = await db.from("powens_links").select("*").eq("user_id", user.id).maybeSingle();
    let token = link ? decrypt(link.token_cipher) : null;
    if (!token) {
      const r = await fetch(api + "/auth/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: secret }), cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.auth_token) throw new Error(j.description || "Powens n’a pas pu créer l’accès.");
      token = j.auth_token;
      await db.from("powens_links").upsert({ user_id: user.id, powens_user_id: String(j.id_user), token_cipher: encrypt(token) });
    }
    const c = await fetch(api + "/auth/token/code?type=singleAccess", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    const code = await c.json();
    if (!c.ok || !code.code) throw new Error(code.description || "Powens n’a pas pu générer le code temporaire.");
    const state = crypto.randomBytes(24).toString("hex");
    await db.from("powens_links").update({ pending_state: state }).eq("user_id", user.id);
    const url = new URL("https://webview.powens.com/fr/connect");
    url.searchParams.set("domain", domain);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", `${siteUrl(request)}/api/powens/callback`);
    url.searchParams.set("code", code.code);
    url.searchParams.set("state", state);
    return NextResponse.json({ url: url.toString() });
  } catch (e) {
    console.error("[powens connect]", e.message);
    return NextResponse.json({ error: e.message || "Connexion bancaire indisponible." }, { status: 500 });
  }
}
