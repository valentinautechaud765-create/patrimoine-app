// Synchronisation bancaire Powens → base Patrimo (côté serveur uniquement).
// Comptes : créés à la première synchro, puis seul le solde est mis à jour (le nom choisi par l'utilisateur est gardé).
// Opérations : importées une seule fois chacune (external_id = « powens:<id> », index unique en base).
import { powensConfig, powensFetch, decrypt } from "./powens.js";
import { guessCategory } from "./categories.js";

const KIND = {
  checking: "courant", joint: "courant", unknown: "courant",
  savings: "epargne", deposit: "epargne",
  market: "investissement", pea: "investissement", lifeinsurance: "investissement", pee: "investissement", perco: "investissement",
  per: "investissement", perp: "investissement", madelin: "investissement", article83: "investissement", rsp: "investissement",
  capitalisation: "investissement", crowdlending: "investissement", real_estate: "investissement",
};
// Les cartes à débit différé et les crédits ne sont pas des avoirs : ils sont ignorés (sinon double comptage).
const SKIP = new Set(["card", "loan"]);

const get = (api, token, path) => powensFetch(api + path, { headers: { Authorization: "Bearer " + token } });

export async function syncUser(db, userId, { days = 180 } = {}) {
  const { data: link } = await db.from("powens_links").select("*").eq("user_id", userId).maybeSingle();
  if (!link) return { linked: false };
  const { api } = powensConfig(), token = decrypt(link.token_cipher);

  // 1. Comptes (avec le nom de la banque)
  const [conns, accs] = await Promise.all([get(api, token, "/users/me/connections?expand=connector"), get(api, token, "/users/me/accounts")]);
  const bankOf = Object.fromEntries((conns.connections || []).map((c) => [c.id, c.connector?.name || c.bank?.name || "Banque"]));
  const errors = (conns.connections || []).filter((c) => c.error).map((c) => ({ bank: c.connector?.name || "Banque", error: c.error, message: c.error_message || null }));
  const remote = (accs.accounts || []).filter((a) => !a.disabled && !a.deleted && !SKIP.has(a.type));
  const { data: existing } = await db.from("accounts").select("id,powens_account_id").eq("user_id", userId).not("powens_account_id", "is", null);
  const byRemote = Object.fromEntries((existing || []).map((a) => [a.powens_account_id, a.id]));
  const now = new Date().toISOString();
  const fresh = [];
  for (const a of remote) {
    const balance = Math.round((Number(a.balance) || 0) * 100) / 100;
    if (byRemote[String(a.id)]) await db.from("accounts").update({ balance, updated_at: now }).eq("id", byRemote[String(a.id)]).eq("user_id", userId);
    else fresh.push({ user_id: userId, powens_account_id: String(a.id), name: a.name || a.original_name || "Compte", institution: bankOf[a.id_connection] || "Banque", kind: KIND[a.type] || "courant", balance, currency: a.currency?.id || "EUR", updated_at: now });
  }
  if (fresh.length) {
    const { data: created, error } = await db.from("accounts").insert(fresh).select("id,powens_account_id");
    if (error) throw new Error("Comptes : " + error.message);
    created.forEach((a) => { byRemote[a.powens_account_id] = a.id; });
  }

  // 2. Opérations depuis la dernière synchro (avec 10 jours de marge : la banque complète parfois avec retard)
  const since = link.last_sync ? new Date(new Date(link.last_sync).getTime() - 10 * 864e5) : new Date(Date.now() - days * 864e5);
  const minDate = since.toISOString().slice(0, 10), rows = [];
  for (let offset = 0, guard = 0; guard < 20; guard++, offset += 1000) {
    const page = await get(api, token, `/users/me/transactions?min_date=${minDate}&limit=1000&offset=${offset}`);
    const list = page.transactions || [];
    for (const t of list) {
      if (t.deleted || t.coming || !byRemote[String(t.id_account)]) continue;
      const amount = Math.round((Number(t.value) || 0) * 100) / 100;
      if (!amount) continue;
      const label = String(t.simplified_wording || t.wording || t.original_wording || "Opération").replace(/\s+/g, " ").trim().slice(0, 120);
      rows.push({ user_id: userId, external_id: "powens:" + t.id, account_id: byRemote[String(t.id_account)], date: String(t.date || t.rdate).slice(0, 10), label, amount, category: guessCategory(label + " " + (t.original_wording || ""), amount) });
    }
    if (list.length < 1000) break;
  }
  let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await db.from("transactions").upsert(rows.slice(i, i + 500), { onConflict: "user_id,external_id", ignoreDuplicates: true }).select("id");
    if (error) throw new Error("Opérations : " + error.message);
    added += data?.length || 0;
  }
  await db.from("powens_links").update({ last_sync: now }).eq("user_id", userId);
  return { linked: true, accounts: remote.length, newAccounts: fresh.length, transactions: added, errors, at: now };
}
