import { NextResponse } from "next/server";
import { powensConfig, powensFetch, decrypt } from "../../../../lib/powens.js";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Suppression d'un compte synchronisé : on le désactive aussi chez Powens (sinon la synchro suivante
// le recrée), on supprime ses opérations bancaires, puis le compte. Si sa connexion n'a plus aucun
// compte actif, la connexion est supprimée chez Powens.
export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
    const { accountId } = await request.json().catch(() => ({}));
    const db = supabaseAdmin();
    const { data: acc } = await db.from("accounts").select("id,powens_account_id").eq("id", accountId).eq("user_id", user.id).maybeSingle();
    if (!acc) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });

    if (acc.powens_account_id) {
      const { data: link } = await db.from("powens_links").select("token_cipher").eq("user_id", user.id).maybeSingle();
      if (link) {
        const { api } = powensConfig(), token = decrypt(link.token_cipher), auth = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
        const id = acc.powens_account_id;
        let done = false;
        for (const method of ["PUT", "POST"]) {
          try { await powensFetch(`${api}/users/me/accounts/${id}`, { method, headers: auth, body: JSON.stringify({ disabled: true }) }); done = true; break; } catch {}
        }
        if (!done) return NextResponse.json({ error: "Powens n’a pas pu désactiver ce compte. Réessayez dans un instant." }, { status: 502 });
        // Connexion vide : on la supprime chez Powens
        try {
          const list = await powensFetch(`${api}/users/me/accounts?all`, { headers: auth });
          const mine = (list.accounts || []).find((a) => String(a.id) === String(id));
          if (mine?.id_connection && !(list.accounts || []).some((a) => a.id_connection === mine.id_connection && !a.disabled && !a.deleted)) {
            await powensFetch(`${api}/users/me/connections/${mine.id_connection}`, { method: "DELETE", headers: auth });
          }
        } catch {}
      }
      await db.from("transactions").delete().eq("user_id", user.id).eq("account_id", acc.id).not("external_id", "is", null);
    }
    const { error } = await db.from("accounts").delete().eq("id", acc.id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[powens supprimer]", e.message);
    return NextResponse.json({ error: e.message || "Suppression impossible." }, { status: 500 });
  }
}
