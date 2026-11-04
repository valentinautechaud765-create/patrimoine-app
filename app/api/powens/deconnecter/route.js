import { NextResponse } from "next/server";
import { powensConfig, powensFetch, decrypt } from "../../../../lib/powens.js";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// « Déconnecter la banque » : on repart de zéro.
//   - chez Powens : toutes les connexions bancaires de l'utilisateur sont supprimées ;
//   - dans Patrimo : les comptes synchronisés, leurs opérations bancaires, les crédits importés et le lien Powens.
// Les comptes et opérations saisis à la main ne sont pas touchés.
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
    const db = supabaseAdmin();
    const { data: link } = await db.from("powens_links").select("token_cipher").eq("user_id", user.id).maybeSingle();
    let connections = 0;
    if (link) {
      try {
        const { api } = powensConfig(), token = decrypt(link.token_cipher), auth = { Authorization: "Bearer " + token };
        const list = await powensFetch(`${api}/users/me/connections`, { headers: auth });
        for (const c of list.connections || []) {
          try { await powensFetch(`${api}/users/me/connections/${c.id}`, { method: "DELETE", headers: auth }); connections++; } catch (e) { console.warn("[powens déconnecter]", c.id, e.message); }
        }
      } catch (e) { console.warn("[powens déconnecter] liste", e.message); }
    }
    const { data: accs } = await db.from("accounts").select("id").eq("user_id", user.id).not("powens_account_id", "is", null);
    const ids = (accs || []).map((a) => a.id);
    let operations = 0;
    if (ids.length) {
      const { data: gone } = await db.from("transactions").delete().eq("user_id", user.id).in("account_id", ids).select("id");
      operations += gone?.length || 0;
      await db.from("accounts").delete().eq("user_id", user.id).in("id", ids);
    }
    // Opérations bancaires restées sans compte, et virements reportés depuis la banque
    const { data: orphans } = await db.from("transactions").delete().eq("user_id", user.id).is("account_id", null).like("external_id", "powens:%").select("id");
    operations += orphans?.length || 0;
    await db.from("debts").delete().eq("user_id", user.id).not("powens_account_id", "is", null);
    await db.from("powens_links").delete().eq("user_id", user.id);
    return NextResponse.json({ ok: true, connections, comptes: ids.length, operations });
  } catch (e) {
    console.error("[powens déconnecter]", e.message);
    return NextResponse.json({ error: e.message || "Déconnexion impossible." }, { status: 500 });
  }
}
