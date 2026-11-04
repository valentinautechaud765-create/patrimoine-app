// Synchronisation bancaire Powens → base Patrimo (côté serveur uniquement).
// Comptes : créés à la première synchro, puis seul le solde est mis à jour (le nom choisi par l'utilisateur est gardé).
// Opérations : importées une seule fois chacune (external_id = « powens:<id> », index unique en base).
import { powensConfig, powensFetch, decrypt } from "./powens.js";
import { guessCategory } from "./categories.js";
import { findInternalTransfers } from "./model.js";

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
  const all = (accs.accounts || []).filter((a) => !a.disabled && !a.deleted);
  const remote = all.filter((a) => !SKIP.has(a.type));
  const { data: allAccounts } = await db.from("accounts").select("id,powens_account_id,name,institution,balance,kind").eq("user_id", userId);
  const existing = (allAccounts || []).filter((a) => a.powens_account_id);
  const manual = (allAccounts || []).filter((a) => !a.powens_account_id);
  const byRemote = Object.fromEntries((existing || []).map((a) => [a.powens_account_id, a.id]));
  const remoteIds = new Set(remote.map((a) => String(a.id)));
  const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, " ").trim();
  // « BNP » saisi à la main = « BNP Paribas » chez Powens ; « Boursorama » = « BoursoBank »
  const bankWords = (x) => norm(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/boursorama/g, "boursobank").split(/[^a-z0-9]+/).filter((w) => w && !["la", "le", "de", "du", "sa"].includes(w));
  const sameBank = (a, b) => {
    const x = bankWords(a), y = bankWords(b);
    if (!x.length || !y.length) return false;
    const [small, big] = x.length <= y.length ? [x, y] : [y, x];
    return small.every((w) => big.includes(w)); // « BNP » ⊂ « BNP Paribas », mais « Banque Populaire » ≠ « Banque Postale »
  };
  const now = new Date().toISOString();
  const fresh = [];
  let linkedManual = 0;
  for (const a of remote) {
    const balance = Math.round((Number(a.balance) || 0) * 100) / 100, bank = bankOf[a.id_connection] || "Banque", name = a.name || a.original_name || "Compte";
    if (!byRemote[String(a.id)]) {
      // Banque reconnectée : Powens donne un nouvel identifiant au même compte. On retrouve l'ancien
      // (même banque, même nom, même solde, plus présent chez Powens) au lieu de créer un doublon.
      const twin = (existing || []).find((e) => !remoteIds.has(e.powens_account_id) && norm(e.institution) === norm(bank) && norm(e.name) === norm(name) && Math.abs(Number(e.balance) - balance) < 0.01);
      if (twin) { await db.from("accounts").update({ powens_account_id: String(a.id) }).eq("id", twin.id).eq("user_id", userId); byRemote[String(a.id)] = twin.id; twin.powens_account_id = String(a.id); }
    }
    if (!byRemote[String(a.id)]) {
      // Compte déjà saisi à la main (ou importé de Mon Patrimoine) pour la même banque : on le relie
      // à la banque au lieu d'en créer un deuxième (sinon le solde compterait deux fois).
      const kind = KIND[a.type] || "courant";
      const atBank = manual.filter((e) => !e.linked && sameBank(e.institution, bank));
      const sameKind = atBank.filter((e) => (e.kind || "courant") === kind);
      const remoteSameKind = remote.filter((x) => bankOf[x.id_connection] === bankOf[a.id_connection] && (KIND[x.type] || "courant") === kind);
      const twin = atBank.find((e) => norm(e.name) === norm(name)) || (sameKind.length === 1 && remoteSameKind.length === 1 ? sameKind[0] : null);
      if (twin) {
        twin.linked = true;
        await db.from("accounts").update({ powens_account_id: String(a.id), institution: bank }).eq("id", twin.id).eq("user_id", userId);
        byRemote[String(a.id)] = twin.id; linkedManual++;
      }
    }
    if (byRemote[String(a.id)]) await db.from("accounts").update({ balance, updated_at: now }).eq("id", byRemote[String(a.id)]).eq("user_id", userId);
    else fresh.push({ user_id: userId, powens_account_id: String(a.id), name, institution: bank, kind: KIND[a.type] || "courant", balance, currency: a.currency?.id || "EUR", updated_at: now });
  }
  if (fresh.length) {
    const { data: created, error } = await db.from("accounts").insert(fresh).select("id,powens_account_id");
    if (error) throw new Error("Comptes : " + error.message);
    created.forEach((a) => { byRemote[a.powens_account_id] = a.id; });
  }

  // 1 bis. Crédits de la banque → onglet Dettes (le capital restant dû est mis à jour à chaque synchro)
  for (const l of all.filter((a) => a.type === "loan")) {
    const remaining = Math.round(Math.abs(Number(l.balance) || 0) * 100) / 100;
    let { data: d } = await db.from("debts").select("id,initial_amount").eq("user_id", userId).eq("powens_account_id", String(l.id)).maybeSingle();
    if (!d) {
      // Crédit déjà saisi à la main sous le même nom : on le relie au lieu d'en créer un second
      const { data: mine } = await db.from("debts").select("id,initial_amount,label,kind,powens_account_id").eq("user_id", userId);
      const twin = (mine || []).find((x) => !x.powens_account_id && x.kind === "credit" && norm(x.label) === norm(l.name || "Crédit"));
      if (twin) { await db.from("debts").update({ powens_account_id: String(l.id) }).eq("id", twin.id).eq("user_id", userId); d = twin; }
    }
    const initial = Math.max(Number(l.loan?.total_amount) || 0, Number(d?.initial_amount) || 0, remaining);
    if (d) await db.from("debts").update({ remaining, initial_amount: initial }).eq("id", d.id).eq("user_id", userId);
    else await db.from("debts").insert({ user_id: userId, kind: "credit", label: l.name || "Crédit", person: bankOf[l.id_connection] || "Banque", initial_amount: initial, remaining, monthly_payment: Number(l.loan?.next_payment_amount) || null, rate: Number(l.loan?.rate) || null, end_date: l.loan?.maturity_date ? String(l.loan.maturity_date).slice(0, 10) : null, powens_account_id: String(l.id) });
  }

  // 2. Opérations depuis la dernière synchro (avec 10 jours de marge : la banque complète parfois avec retard)
  const since = link.last_sync ? new Date(new Date(link.last_sync).getTime() - 10 * 864e5) : new Date(Date.now() - days * 864e5);
  const minDate = since.toISOString().slice(0, 10), rows = [];
  // Banques de ses autres comptes (y compris saisis à la main), pour reconnaître les virements entre ses comptes
  const generic = new Set(["banque", "credit", "caisse", "compte", "epargne", "societe", "generale", "populaire", "postale", "mutuel", "agricole"]);
  const ownBanks = [...new Set((allAccounts || []).flatMap((a) => bankWords(a.institution)).filter((w) => w.length >= 3 && !generic.has(w)))];
  for (let offset = 0, guard = 0; guard < 20; guard++, offset += 1000) {
    const page = await get(api, token, `/users/me/transactions?min_date=${minDate}&limit=1000&offset=${offset}`);
    const list = page.transactions || [];
    for (const t of list) {
      if (t.deleted || t.coming || !byRemote[String(t.id_account)]) continue;
      const amount = Math.round((Number(t.value) || 0) * 100) / 100;
      if (!amount) continue;
      const label = String(t.simplified_wording || t.wording || t.original_wording || "Opération").replace(/\s+/g, " ").trim().slice(0, 120);
      // Virement vers / depuis un de ses propres comptes dans une autre banque (ex. BNP → Revolut saisi à la main) :
      // ce n'est ni une dépense ni un revenu.
      const raw = label + " " + (t.original_wording || "");
      const toOwnBank = /\b(vir|virement|transfert|transfer|vers|from|to)\b/i.test(raw) && ownBanks.some((w) => new RegExp("\\b" + w + "\\b", "i").test(raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
      rows.push({ user_id: userId, external_id: "powens:" + t.id, account_id: byRemote[String(t.id_account)], date: String(t.date || t.rdate).slice(0, 10), label, amount, category: toOwnBank ? "Virement interne" : guessCategory(raw, amount) });
    }
    if (list.length < 1000) break;
  }

  // 3. Anti-doublons : une opération déjà présente (même compte, date, montant, libellé) sous un autre
  // identifiant — cas d'une banque reconnectée — n'est pas réimportée. Deux achats identiques le même
  // jour restent bien deux opérations (on compare les quantités, pas seulement l'existence).
  const accountIds = [...new Set(rows.map((r) => r.account_id))];
  const { data: known } = accountIds.length ? await db.from("transactions").select("id,external_id,account_id,date,amount,label,category").eq("user_id", userId).gte("date", minDate).in("account_id", accountIds) : { data: [] };
  const knownExt = new Set((known || []).map((t) => t.external_id).filter(Boolean));
  const key = (t) => [t.account_id, t.date, Number(t.amount).toFixed(2), norm(t.label)].join("|");
  const inBank = {}, inBase = {};
  rows.forEach((r) => { inBank[key(r)] = (inBank[key(r)] || 0) + 1; });
  (known || []).forEach((t) => { inBase[key(t)] = (inBase[key(t)] || 0) + 1; });
  // Opérations saisies à la main (ou créées par une opération automatique) sur un compte maintenant relié :
  // même compte, même montant, à 3 jours près → c'est la même opération. On la garde (avec sa catégorie)
  // en lui donnant l'identifiant de la banque, au lieu d'ajouter un doublon.
  const manualTx = (known || []).filter((t) => !t.external_id);
  const used = new Set();
  const dayGap = (a, b) => Math.abs((new Date(a + "T12:00:00Z") - new Date(b + "T12:00:00Z")) / 864e5);
  const toInsert = [], adopt = [];
  for (const r of rows) {
    if (knownExt.has(r.external_id)) continue;
    const k = key(r);
    if ((inBase[k] || 0) >= inBank[k]) continue; // déjà autant d'exemplaires en base qu'à la banque
    const twin = manualTx
      .filter((t) => !used.has(t.id) && t.account_id === r.account_id && Number(t.amount).toFixed(2) === r.amount.toFixed(2) && dayGap(String(t.date).slice(0, 10), r.date) <= 3)
      .sort((a, b) => dayGap(String(a.date).slice(0, 10), r.date) - dayGap(String(b.date).slice(0, 10), r.date))[0];
    if (twin) { used.add(twin.id); adopt.push({ id: twin.id, external_id: r.external_id }); continue; }
    inBase[k] = (inBase[k] || 0) + 1;
    toInsert.push(r);
  }
  for (const a of adopt) await db.from("transactions").update({ external_id: a.external_id }).eq("id", a.id).eq("user_id", userId);
  let added = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const { data, error } = await db.from("transactions").upsert(toInsert.slice(i, i + 500), { onConflict: "user_id,external_id", ignoreDuplicates: true }).select("id");
    if (error) throw new Error("Opérations : " + error.message);
    added += data?.length || 0;
  }

  // 4. Virements entre ses propres comptes (Revolut ↔ pockets…) : ni dépense ni revenu
  const { data: recent } = accountIds.length ? await db.from("transactions").select("id,account_id,date,amount,category").eq("user_id", userId).gte("date", minDate).not("external_id", "is", null) : { data: [] };
  const pairs = findInternalTransfers(recent || []);
  const internal = pairs.flat();
  if (internal.length) await db.from("transactions").update({ category: "Virement interne" }).eq("user_id", userId).in("id", internal);

  await db.from("powens_links").update({ last_sync: now }).eq("user_id", userId);
  return { linked: true, accounts: remote.length, newAccounts: fresh.length, linkedAccounts: linkedManual, transactions: added, mergedTransactions: adopt.length, skippedDuplicates: rows.filter((r) => !knownExt.has(r.external_id)).length - toInsert.length - adopt.length, internalTransfers: pairs.length, errors, at: now };
}
