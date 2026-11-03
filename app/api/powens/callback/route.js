import { NextResponse } from "next/server";
import { powensConfig, decrypt } from "../../../../lib/powens.js";
import { supabaseAdmin } from "../../../../lib/supabase.js";
import { siteUrl } from "../../../../lib/stripe.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND = { checking: "courant", card: "courant", savings: "epargne", deposit: "epargne", market: "investissement", pea: "investissement", lifeinsurance: "investissement", pee: "investissement", per: "investissement" };

// Retour de Powens après la connexion : on importe les comptes de la banque.
export async function GET(request) {
  const url = new URL(request.url), back = new URL("/app", siteUrl(request));
  try {
    const state = url.searchParams.get("state") || "";
    if (!/^[a-f0-9]{48}$/.test(state)) throw new Error("état invalide");
    if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error"));
    const db = supabaseAdmin();
    const { data: link } = await db.from("powens_links").select("*").eq("pending_state", state).maybeSingle();
    if (!link) throw new Error("tentative expirée");
    await db.from("powens_links").update({ pending_state: null }).eq("user_id", link.user_id);
    const { api } = powensConfig();
    const r = await fetch(api + "/users/me/accounts", { headers: { Authorization: "Bearer " + decrypt(link.token_cipher) }, cache: "no-store" });
    const j = await r.json();
    const rows = (j.accounts || []).filter(a => !a.disabled).map(a => ({
      user_id: link.user_id, powens_account_id: String(a.id), name: a.name || "Compte", institution: a.bank_name || a.connection?.bank?.name || "Banque",
      kind: KIND[a.type] || "courant", balance: Number(a.balance) || 0, currency: a.currency?.id || "EUR", updated_at: new Date().toISOString(),
    }));
    if (rows.length) await db.from("accounts").upsert(rows, { onConflict: "user_id,powens_account_id" });
    back.searchParams.set("banque", "ok");
  } catch (e) {
    console.error("[powens callback]", e.message);
    back.searchParams.set("banque", "erreur");
  }
  return NextResponse.redirect(back);
}
