"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppView from "../components/app/AppView.js";
import { BrandMark } from "../components/Brand.js";
import { supabaseBrowser, supabaseConfigured } from "../../lib/supabase.js";
import { demoData } from "../../lib/demo.js";
import { OWNER_EMAILS } from "../../lib/config.js";
import { computeModel, positionFromTrades, advanceDate, firstDate } from "../../lib/model.js";

const NUM = ["amount", "quantity", "cost_basis", "value", "balance", "monthly_limit", "total"];
const clean = (r) => { const o = { ...r }; NUM.forEach((k) => { if (k in o) o[k] = Number(o[k]) || 0; }); return o; };
const todayStr = () => new Date().toISOString().slice(0, 10);
const byDate = (l) => l.sort((a, b) => String(b.date).localeCompare(String(a.date)));

const NOTICES = {
  "paiement=ok": { text: "Abonnement activé. Bienvenue !", tone: "ok" },
  "banque=ok": { text: "Banque connectée : vos comptes ont été importés.", tone: "ok" },
  "banque=erreur": { text: "La connexion bancaire n’a pas abouti. Réessayez.", tone: "bad" },
};

function Boot() {
  return <div className="boot"><BrandMark size={44} /><span className="bootBar"><i /></span></div>;
}

function App() {
  const router = useRouter(), params = useSearchParams();
  const [data, setData] = useState(null);
  const demo = !supabaseConfigured;

  const load = useCallback(async () => {
    if (demo) { setData({ ...demoData(), trades: [], recurrences: [], session: null }); return; }
    const sb = supabaseBrowser();
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { router.replace("/connexion"); return; }
    // Chaque requête ne renvoie que les lignes de l'utilisateur connecté (règles RLS côté base).
    const [profile, accounts, holdings, transactions, budgets, snapshots, trades, recurrences] = await Promise.all([
      sb.from("profiles").select("*").eq("id", s.session.user.id).maybeSingle(),
      sb.from("accounts").select("*").order("created_at"),
      sb.from("holdings").select("*").order("value", { ascending: false }),
      sb.from("transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
      sb.from("budgets").select("*"),
      sb.from("net_worth_snapshots").select("date,total").order("date"),
      sb.from("trades").select("*").order("date"),
      sb.from("recurrences").select("*").order("next_date"),
    ]);
    const pr = profile.data || { plan: "free" };
    // Propriétaire : accès complet. Le serveur l'enregistre dans la base ; l'affichage est débloqué
    // tout de suite pour l'adresse propriétaire confirmée (les routes serveur revérifient de leur côté).
    const u = s.session.user, isOwner = OWNER_EMAILS.includes(String(u.email || "").toLowerCase()) && Boolean(u.email_confirmed_at || u.confirmed_at);
    if (isOwner) {
      pr.plan = "pro"; pr.plan_status = "active";
      fetch("/api/compte", { method: "POST", headers: { Authorization: "Bearer " + s.session.access_token } })
        .then((r) => r.json()).then((j) => { if (!j.owner) console.warn("[compte]", j.error || j.reason); })
        .catch((e) => console.warn("[compte]", e.message));
    }
    if (pr.plan_status === "trialing" && pr.current_period_end) pr.trial_days_left = Math.max(0, Math.ceil((new Date(pr.current_period_end) - Date.now()) / 864e5));
    const num = (rows, keys) => (rows || []).map((r) => { const o = { ...r }; keys.forEach((k) => { o[k] = Number(o[k]) || 0; }); return o; });
    setData({
      profile: pr,
      accounts: num(accounts.data, ["balance"]),
      holdings: num(holdings.data, ["quantity", "cost_basis", "value"]),
      transactions: num(transactions.data, ["amount"]),
      budgets: num(budgets.data, ["monthly_limit"]),
      snapshots: num(snapshots.data, ["total"]),
      trades: num(trades.data, ["quantity", "price", "fees", "amount"]),
      tradesMissing: Boolean(trades.error),
      recurrences: num(recurrences.data, ["amount"]),
      recurrencesMissing: Boolean(recurrences.error),
      session: s.session,
    });
  }, [demo, router]);

  useEffect(() => { load(); }, [load]);

  const notice = useMemo(() => {
    for (const [k, v] of Object.entries(NOTICES)) { const [a, b] = k.split("="); if (params.get(a) === b) return v; }
    return null;
  }, [params]);

  // Appel d'une route serveur avec le jeton de session
  const api = useCallback(async (path, body) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(data?.session ? { Authorization: "Bearer " + data.session.access_token } : {}) }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (/n’est pas encore configur|manquant/i.test(j.error || "")) throw new Error(path.includes("powens") ? "La connexion bancaire n’est pas encore activée. Elle arrive très bientôt." : "Le paiement en ligne n’est pas encore activé. Il arrive très bientôt.");
      throw new Error(j.error || "Service momentanément indisponible.");
    }
    return j;
  }, [data?.session]);

  const user = data?.session?.user?.id;
  const live = useRef(data); live.current = data;

  // Écriture générique : ajout (sans id) ou modification (avec id). En démo, tout reste en mémoire.
  async function write(table, row) {
    if (demo) return { ...row, id: row.id || "local" + Date.now() + Math.random().toString(36).slice(2, 6) };
    const sb = supabaseBrowser(), { id, user_id, created_at, ...fields } = row;
    const q = id ? sb.from(table).update(fields).eq("id", id) : sb.from(table).insert({ ...fields, user_id: user });
    const { data: saved, error } = await q.select().single();
    if (error) throw new Error("Enregistrement impossible : " + error.message);
    return clean(saved);
  }
  async function erase(table, match) {
    if (demo) return;
    let q = supabaseBrowser().from(table).delete();
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw new Error("Suppression impossible : " + error.message);
  }
  const replace = (key, row, sort = (l) => l) => setData((d) => ({ ...d, [key]: sort([...d[key].filter((x) => x.id !== row.id), row]) }));
  const drop = (key, id) => setData((d) => ({ ...d, [key]: d[key].filter((x) => x.id !== id) }));

  // Comptes saisis à la main : le solde suit les opérations qu'on y enregistre.
  // (Les comptes synchronisés avec la banque gardent le solde donné par la banque.)
  async function shiftBalance(accountId, delta) {
    const acc = live.current.accounts.find((a) => a.id === accountId);
    if (!acc || acc.powens_account_id || !delta) return;
    const saved = await write("accounts", { id: acc.id, balance: Math.round((Number(acc.balance) + delta) * 100) / 100, updated_at: new Date().toISOString() });
    replace("accounts", { ...acc, ...saved });
  }

  async function applyTrades(holdingId, allTrades) {
    const h = live.current.holdings.find((x) => x.id === holdingId); if (!h) return;
    const pos = positionFromTrades(allTrades.filter((x) => x.holding_id === holdingId));
    const ratio = Number(h.quantity) > 0 ? Number(h.value) / Number(h.quantity) : 0;
    const row = { id: h.id, quantity: pos.quantity, cost_basis: pos.cost, value: Math.round(pos.quantity * ratio * 100) / 100 || (pos.quantity > 0 ? pos.cost : 0), updated_at: new Date().toISOString() };
    const saved = await write("holdings", row);
    replace("holdings", { ...h, ...saved }, (l) => l.sort((x, y) => y.value - x.value));
  }

  // Photo du jour du patrimoine, pour que la courbe se construise même sans attendre la tâche du soir.
  const snapTimer = useRef(0);
  useEffect(() => {
    if (demo || !data?.session) return;
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const total = Math.round(computeModel(live.current).total * 100) / 100, date = new Date().toISOString().slice(0, 10);
      supabaseBrowser().from("net_worth_snapshots").upsert({ user_id: user, date, total }).then(() => {});
    }, 1500);
  }, [data?.accounts, data?.holdings, demo, user]); // eslint-disable-line

  // Opérations automatiques : à chaque ouverture, on crée les échéances arrivées (une seule fois chacune,
  // grâce au lien recurrence_id + date). Le solde des comptes saisis à la main suit.
  const materialized = useRef(false);
  useEffect(() => {
    if (!data || materialized.current || data.recurrencesMissing) return;
    materialized.current = true;
    (async () => {
      const today = todayStr(), rows = [], moves = [];
      for (const r of live.current.recurrences || []) {
        if (!r.active) continue;
        let due = r.next_date, guard = 0;
        while (due <= today && (!r.end_date || due <= r.end_date) && guard++ < 120) {
          rows.push({ date: due, label: r.label, amount: Number(r.amount), category: r.category, account_id: r.account_id || null, recurrence_id: r.id });
          due = advanceDate(due, r.frequency, r.day);
        }
        if (due !== r.next_date) moves.push({ id: r.id, next_date: due });
      }
      if (!rows.length) return;
      let created = rows.map((x, i) => ({ id: "auto" + Date.now() + i, ...x }));
      if (!demo) {
        const { data: ins, error } = await supabaseBrowser().from("transactions").upsert(rows.map((x) => ({ ...x, user_id: user })), { onConflict: "recurrence_id,date", ignoreDuplicates: true }).select();
        if (error) return;
        created = (ins || []).map(clean);
        for (const mv of moves) await supabaseBrowser().from("recurrences").update({ next_date: mv.next_date }).eq("id", mv.id);
      }
      setData((d) => ({ ...d, transactions: byDate([...d.transactions, ...created]), recurrences: d.recurrences.map((r) => ({ ...r, ...(moves.find((m) => m.id === r.id) || {}) })) }));
      const deltas = {}; created.forEach((t) => { if (t.account_id) deltas[t.account_id] = (deltas[t.account_id] || 0) + Number(t.amount); });
      for (const [acc, delta] of Object.entries(deltas)) await shiftBalance(acc, Math.round(delta * 100) / 100);
    })();
  }, [data]); // eslint-disable-line

  const actions = {
    notice,
    async checkout(plan, billing) {
      if (demo) return { message: "Démonstration : le paiement s’activera une fois Stripe branché." };
      const { url } = await api("/api/stripe/checkout", { plan, billing });
      window.location.href = url;
    },
    async managePlan() {
      if (demo) return { message: "Démonstration : l’espace de facturation s’ouvrira avec Stripe." };
      const { url } = await api("/api/stripe/portal");
      window.location.href = url;
    },
    async connectBank() {
      if (demo) return { message: "Démonstration : la connexion bancaire s’activera avec Powens." };
      const { url } = await api("/api/powens/connect");
      window.location.href = url;
    },
    async saveTransaction(t, repeatFreq) {
      if (repeatFreq && live.current.recurrencesMissing) throw new Error("Mise à jour de la base nécessaire pour les opérations automatiques : relance supabase/schema.sql dans Supabase (SQL Editor → Run).");
      const before = t.id ? live.current.transactions.find((x) => x.id === t.id) : null;
      const saved = await write("transactions", t);
      replace("transactions", { ...before, ...t, ...saved }, byDate);
      const deltas = {};
      if (before?.account_id) deltas[before.account_id] = (deltas[before.account_id] || 0) - Number(before.amount);
      if (saved.account_id) deltas[saved.account_id] = (deltas[saved.account_id] || 0) + Number(saved.amount);
      for (const [acc, delta] of Object.entries(deltas)) await shiftBalance(acc, Math.round(delta * 100) / 100);
      if (repeatFreq) {
        // L'opération du jour est créée normalement ; la règle reprend à l'échéance suivante.
        const rule = { label: t.label, amount: t.amount, category: t.category, account_id: t.account_id || null, frequency: repeatFreq, day: Number(String(t.date).slice(8, 10)) || 1, next_date: advanceDate(t.date, repeatFreq, Number(String(t.date).slice(8, 10))), active: true };
        const r = await write("recurrences", rule);
        await write("transactions", { id: saved.id, recurrence_id: r.id }).catch(() => {});
        replace("recurrences", { ...rule, ...r });
        return { message: "Opération ajoutée et répétée automatiquement" };
      }
      return { message: before ? "Opération modifiée" : "Opération ajoutée" };
    },
    async deleteTransaction(t) {
      await erase("transactions", { id: t.id });
      drop("transactions", t.id);
      if (t.account_id) await shiftBalance(t.account_id, -Number(t.amount));
      return { message: "Opération supprimée" };
    },
    async saveAccount(a) {
      let saved;
      try { saved = await write("accounts", { ...a, updated_at: new Date().toISOString() }); }
      catch (e) {
        // Base pas encore mise à jour (colonne « rate ») : on enregistre le reste et on prévient.
        if (!/rate/i.test(e.message) || !("rate" in a)) throw e;
        const { rate, ...rest } = a; saved = await write("accounts", { ...rest, updated_at: new Date().toISOString() });
        replace("accounts", { ...rest, ...saved });
        return { message: "Compte enregistré. Pour le taux, relance schema.sql dans Supabase." };
      }
      replace("accounts", { ...a, ...saved });
      return { message: a.id ? "Compte modifié" : "Compte ajouté" };
    },
    async deleteAccount(a) {
      await erase("accounts", { id: a.id });
      setData((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id), transactions: d.transactions.map((t) => t.account_id === a.id ? { ...t, account_id: null } : t) }));
      return { message: "Compte supprimé" };
    },
    async saveHolding(h) {
      const saved = await write("holdings", { ...h, updated_at: new Date().toISOString() });
      replace("holdings", { ...h, ...saved }, (l) => l.sort((x, y) => y.value - x.value));
      return { message: h.id ? "Position mise à jour" : "Position ajoutée" };
    },
    async deleteHolding(h) {
      await erase("holdings", { id: h.id });
      drop("holdings", h.id);
      return { message: "Position supprimée" };
    },
    async saveBudget(b, previous) {
      if (!demo) {
        if (previous && previous !== b.category) await erase("budgets", { category: previous });
        const { error } = await supabaseBrowser().from("budgets").upsert({ category: b.category, monthly_limit: b.monthly_limit, user_id: user });
        if (error) throw new Error("Enregistrement impossible : " + error.message);
      }
      setData((d) => ({ ...d, budgets: [...d.budgets.filter((x) => x.category !== b.category && x.category !== previous), { category: b.category, monthly_limit: b.monthly_limit }] }));
      return { message: previous ? "Budget modifié" : "Budget créé" };
    },
    async deleteBudget(category) {
      await erase("budgets", { category });
      setData((d) => ({ ...d, budgets: d.budgets.filter((x) => x.category !== category) }));
      return { message: "Budget supprimé" };
    },
    async saveName(full_name) {
      if (!demo) {
        const { error } = await supabaseBrowser().from("profiles").update({ full_name }).eq("id", user);
        if (error) throw new Error("Enregistrement impossible : " + error.message);
      }
      setData((d) => ({ ...d, profile: { ...d.profile, full_name } }));
      return { message: "Prénom enregistré" };
    },
    // Import des données exportées depuis « Mon Patrimoine ». Relançable sans doublons :
    // comptes et positions retrouvés par leur nom, opérations par date + libellé + montant.
    async importMonPatrimoine(file) {
      if (file?.format !== "mon-patrimoine/v1") throw new Error("Ce fichier ne vient pas de Mon Patrimoine.");
      const d = live.current, sb = demo ? null : supabaseBrowser(), today = new Date().toISOString().slice(0, 10);
      const keyAcc = (name, inst) => (String(name || "") + "|" + String(inst || "")).toLowerCase().trim();
      const accIndex = Object.fromEntries(d.accounts.map((a) => [keyAcc(a.name, a.institution), a]));
      const insertMany = async (table, rows) => {
        if (!rows.length) return [];
        if (demo) return rows.map((r, i) => ({ id: "imp" + Date.now() + i + Math.random().toString(36).slice(2, 5), ...r }));
        const out = [];
        for (let i = 0; i < rows.length; i += 400) {
          const { data: saved, error } = await sb.from(table).insert(rows.slice(i, i + 400).map((r) => ({ ...r, user_id: user }))).select();
          if (error) throw new Error("Import impossible (" + table + ") : " + error.message);
          out.push(...saved.map(clean));
        }
        return out;
      };
      // 1. Comptes (courants + livrets)
      const kindOf = (t) => /épargne|epargne|livret/i.test(String(t || "")) ? "epargne" : "courant";
      const wanted = [
        ...(file.comptes || []).map((c) => ({ src: c.id, name: c.nom || "Compte", institution: c.banque || null, kind: kindOf(c.type), balance: Math.round((Number(c.solde) || 0) * 100) / 100 })),
        ...(file.livrets || []).map((l) => ({ src: l.id, name: l.nom || "Épargne", institution: l.banque || null, kind: "epargne", balance: Math.round((Number(l.valeur) || 0) * 100) / 100 })),
      ];
      const idMap = {}, newAccounts = [], updated = [];
      for (const w of wanted) {
        const hit = accIndex[keyAcc(w.name, w.institution)];
        if (hit) { const saved = await write("accounts", { id: hit.id, balance: w.balance, kind: w.kind, updated_at: new Date().toISOString() }); updated.push({ ...hit, ...saved }); idMap[w.src] = hit.id; }
        else newAccounts.push(w);
      }
      const createdAcc = await insertMany("accounts", newAccounts.map(({ src, ...r }) => ({ ...r, currency: "EUR" })));
      createdAcc.forEach((a, i) => { idMap[newAccounts[i].src] = a.id; });
      // 2. Opérations (sans doublons)
      const seen = {};
      d.transactions.forEach((t) => { const k = t.date + "|" + String(t.label).toLowerCase() + "|" + Number(t.amount).toFixed(2); seen[k] = (seen[k] || 0) + 1; });
      const txRows = [];
      for (const o of file.operations || []) {
        const amount = Math.round((o.type === "Rentrée" ? 1 : -1) * Math.abs(Number(o.montant) || 0) * 100) / 100;
        if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
        const label = String(o.libelle || o.categorie || "Opération").slice(0, 120), k = o.date + "|" + label.toLowerCase() + "|" + amount.toFixed(2);
        if (seen[k]) { seen[k]--; continue; }
        txRows.push({ date: o.date, label, amount, category: String(o.categorie || "Autre").slice(0, 40), account_id: idMap[o.compteId] || null });
      }
      const createdTx = await insertMany("transactions", txRows);
      // 3. Placements
      const classOf = (p) => { const t = (p.type + " " + p.nom + " " + p.ticker).toLowerCase(); return /crypto|bitcoin|btc|eth/.test(t) ? "Crypto" : /etf|tracker|msci|s&p|world/.test(t) ? "ETF" : /oblig/.test(t) ? "Obligations" : /fonds|opcvm|scpi|assurance/.test(t) ? "Fonds" : "Action"; };
      const hIndex = Object.fromEntries(d.holdings.map((h) => [(h.name + "|" + (h.ticker || "")).toLowerCase(), h]));
      const newH = [], updH = [], plMap = {}, newSrc = [];
      for (const pl of file.placements || []) {
        const row = { name: pl.nom || pl.ticker || "Placement", ticker: pl.ticker || null, asset_class: classOf(pl), quantity: Number(pl.quantite) || 0, cost_basis: Math.round((Number(pl.investi) || 0) * 100) / 100, value: Math.round((Number(pl.valeur) || 0) * 100) / 100, currency: pl.devise === "USD" ? "USD" : "EUR" };
        const hit = hIndex[(row.name + "|" + (row.ticker || "")).toLowerCase()];
        if (hit) { const saved = await write("holdings", { id: hit.id, ...row, updated_at: new Date().toISOString() }); updH.push({ ...hit, ...saved }); plMap[pl.id] = { id: hit.id, investi: row.cost_basis }; }
        else { newH.push(row); newSrc.push(pl); }
      }
      const createdH = await insertMany("holdings", newH);
      createdH.forEach((h, i) => { plMap[newSrc[i].id] = { id: h.id, investi: h.cost_basis }; });
      // Transactions des placements (achats, ventes, dividendes), seulement pour les positions qui n'en ont pas encore.
      // Pour un titre en dollars, les montants sont ramenés en euros au prorata du montant investi exporté.
      let tradeCount = 0;
      if (!d.tradesMissing && Array.isArray(file.trades) && file.trades.length) {
        const already = new Set(d.trades.map((t) => t.holding_id)), rows = [];
        const byPl = {}; file.trades.forEach((t) => { if (plMap[t.placementId]) (byPl[t.placementId] ||= []).push(t); });
        for (const [plId, list] of Object.entries(byPl)) {
          const target = plMap[plId]; if (already.has(target.id)) continue;
          const native = (t) => t.type === "Dividende" ? t.price - t.fees : t.type === "Achat" ? t.quantity * t.price + t.fees : t.quantity * t.price - t.fees;
          const usd = list.some((t) => t.currency === "USD");
          let factor = 1;
          if (usd) { const nativeCost = positionFromTrades(list.map((t) => ({ ...t, amount: native(t) }))).cost; factor = nativeCost > 0 && target.investi > 0 ? target.investi / nativeCost : 1; }
          list.forEach((t) => rows.push({ holding_id: target.id, type: t.type, quantity: t.type === "Dividende" ? 0 : Number(t.quantity) || 0, price: Number(t.price) || 0, fees: Number(t.fees) || 0, amount: Math.round(native(t) * factor * 100) / 100, currency: t.currency === "USD" ? "USD" : "EUR", date: t.date }));
        }
        const createdT = await insertMany("trades", rows);
        tradeCount = createdT.length;
        if (createdT.length) setData((x) => ({ ...x, trades: [...x.trades, ...createdT] }));
      }
      // 3 bis. Opérations automatiques : les échéances passées sont déjà dans les opérations importées,
      // on reprend donc à partir de la prochaine échéance (pas de doublon).
      let recCount = 0;
      if (!d.recurrencesMissing && Array.isArray(file.recurrences) && file.recurrences.length) {
        const have = new Set((d.recurrences || []).map((r) => (r.label + "|" + Number(r.amount).toFixed(2)).toLowerCase()));
        const freqOf = (f) => ["hebdomadaire", "mensuelle", "annuelle"].includes(f) ? f : "mensuelle";
        const recRows = file.recurrences.filter((r) => Number(r.montant) > 0).map((r) => {
          const amount = Math.round((r.type === "Rentrée" ? 1 : -1) * Math.abs(Number(r.montant)) * 100) / 100, frequency = freqOf(r.frequence);
          const day = Math.min(31, Math.max(1, Number(r.jour) || Number(String(r.dateDebut).slice(8, 10)) || 1));
          let next = /^\d{4}-\d{2}-\d{2}$/.test(r.dateDebut) ? r.dateDebut : today, guard = 0;
          while (next <= today && guard++ < 600) next = advanceDate(next, frequency, day);
          return { label: String(r.libelle || r.categorie || "Opération").slice(0, 120), amount, category: String(r.categorie || "Autre").slice(0, 40), account_id: idMap[r.compteId] || null, frequency, day, next_date: next, end_date: /^\d{4}-\d{2}-\d{2}$/.test(r.dateFin) ? r.dateFin : null, active: r.active !== false };
        }).filter((r) => !have.has((r.label + "|" + r.amount.toFixed(2)).toLowerCase()));
        const createdR = await insertMany("recurrences", recRows);
        recCount = createdR.length;
        if (createdR.length) setData((x) => ({ ...x, recurrences: [...(x.recurrences || []), ...createdR] }));
      }
      // 4. Budgets
      const budgets = Object.entries(file.budgets || {}).filter(([, v]) => Number(v) > 0).map(([category, v]) => ({ category: String(category).slice(0, 40), monthly_limit: Math.round(Number(v) * 100) / 100 }));
      if (!demo && budgets.length) { const { error } = await sb.from("budgets").upsert(budgets.map((b) => ({ ...b, user_id: user }))); if (error) throw new Error("Import impossible (budgets) : " + error.message); }
      // 5. Historique du patrimoine (courbe)
      const hist = (file.historique || []).filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.date < today && Number.isFinite(Number(h.total))).map((h) => ({ date: h.date, total: Math.round(Number(h.total) * 100) / 100 }));
      if (!demo && hist.length) { const { error } = await sb.from("net_worth_snapshots").upsert(hist.map((h) => ({ ...h, user_id: user }))); if (error) throw new Error("Import impossible (historique) : " + error.message); }
      setData((x) => {
        const accounts = [...x.accounts.filter((a) => !updated.some((u) => u.id === a.id)), ...updated, ...createdAcc];
        const holdings = [...x.holdings.filter((h) => !updH.some((u) => u.id === h.id)), ...updH, ...createdH].sort((a, b) => b.value - a.value);
        const snaps = Object.fromEntries(x.snapshots.map((sn) => [sn.date, sn])); hist.forEach((h) => { snaps[h.date] = h; });
        return { ...x, accounts, holdings, transactions: byDate([...x.transactions, ...createdTx]), budgets: [...x.budgets.filter((b) => !budgets.some((n) => n.category === b.category)), ...budgets], snapshots: Object.values(snaps).sort((a, b) => a.date.localeCompare(b.date)) };
      });
      return { message: "Import terminé", ok: true, summary: { comptes: createdAcc.length + updated.length, operations: createdTx.length, ignorees: (file.operations || []).length - createdTx.length, placements: createdH.length + updH.length, transactionsBourse: tradeCount, automatiques: recCount, budgets: budgets.length, jours: hist.length } };
    },
    // Cours de bourse en direct (serveur Patrimo → Tradegate / Yahoo / Twelve Data)
    async fetchQuotes(symbols, withDay) {
      const token = live.current?.session?.access_token;
      const r = await fetch(`/api/cours?symbols=${encodeURIComponent(symbols.join(","))}${withDay ? "&jour=1" : ""}`, { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (!r.ok) throw new Error("Cours indisponibles");
      return r.json();
    },
    // Enregistre de temps en temps la valeur au dernier cours (pour l'historique et le calcul du soir)
    async syncHoldingValues(list) {
      if (demo) return;
      for (const h of list) await supabaseBrowser().from("holdings").update({ value: h.value, updated_at: new Date().toISOString() }).eq("id", h.id);
    },
    // Achats / ventes / dividendes : la position (quantité, prix de revient) est recalculée à chaque fois
    async saveTrade(t) {
      if (live.current.tradesMissing) throw new Error("Mise à jour de la base nécessaire : relance le script supabase/schema.sql dans Supabase (SQL Editor → Run).");
      // Première transaction sur une position déjà détenue : on enregistre d'abord ce qui était déjà là
      // comme position de départ, pour ne pas perdre les parts ni le prix de revient existants.
      let base = live.current.trades;
      const h = live.current.holdings.find((x) => x.id === t.holding_id);
      if (!t.id && h && Number(h.quantity) > 0 && !base.some((x) => x.holding_id === h.id)) {
        const q = Number(h.quantity), cost = Number(h.cost_basis) || 0;
        const opening = await write("trades", { holding_id: h.id, type: "Achat", quantity: q, price: q > 0 ? Math.round((cost / q) * 1e6) / 1e6 : 0, fees: 0, amount: cost, currency: "EUR", date: t.date < todayStr() ? t.date : todayStr() });
        base = [...base, { holding_id: h.id, type: "Achat", quantity: q, amount: cost, date: opening.date, ...opening, created_at: opening.created_at || new Date(Date.now() - 1000).toISOString() }];
      }
      const saved = await write("trades", t);
      const trades = [...base.filter((x) => x.id !== saved.id), { ...t, ...saved, created_at: saved.created_at || new Date().toISOString() }];
      setData((d) => ({ ...d, trades }));
      await applyTrades(t.holding_id, trades);
      return { message: t.id ? "Transaction modifiée" : t.type === "Dividende" ? "Dividende ajouté" : t.type === "Achat" ? "Achat enregistré" : "Vente enregistrée" };
    },
    async deleteTrade(t) {
      await erase("trades", { id: t.id });
      const trades = live.current.trades.filter((x) => x.id !== t.id);
      setData((d) => ({ ...d, trades }));
      await applyTrades(t.holding_id, trades);
      return { message: "Transaction supprimée" };
    },
    async fetchHistory(symbols, period) {
      const token = live.current?.session?.access_token;
      const r = await fetch(`/api/cours?historique=${encodeURIComponent(symbols.join(","))}&periode=${period}`, { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (!r.ok) throw new Error("Courbe indisponible");
      return r.json();
    },
    async saveRecurrence(r) {
      if (live.current.recurrencesMissing) throw new Error("Mise à jour de la base nécessaire : relance le script supabase/schema.sql dans Supabase (SQL Editor → Run).");
      const saved = await write("recurrences", r);
      replace("recurrences", { ...r, ...saved }, (l) => l.sort((a, b) => String(a.next_date).localeCompare(String(b.next_date))));
      materialized.current = false; setData((d) => ({ ...d })); // crée tout de suite une échéance déjà passée
      return { message: r.id ? "Opération automatique modifiée" : "Opération automatique créée" };
    },
    async deleteRecurrence(r) {
      await erase("recurrences", { id: r.id });
      drop("recurrences", r.id);
      return { message: "Opération automatique supprimée (les opérations déjà passées sont conservées)" };
    },
    async deleteAccountForever() {
      if (demo) return { message: "Démonstration : rien n’est supprimé." };
      await api("/api/compte/supprimer");
      await supabaseBrowser().auth.signOut();
      router.replace("/?compte=supprime");
    },
    async resetPassword() {
      if (demo) return { message: "Démonstration : aucun e-mail n’est envoyé." };
      await supabaseBrowser().auth.resetPasswordForEmail(data.session.user.email, { redirectTo: window.location.origin + "/connexion" });
      return { message: "Lien envoyé à " + data.session.user.email };
    },
    async logout() {
      await supabaseBrowser()?.auth.signOut();
      router.replace("/");
    },
  };

  // Retour de la page d'inscription avec une formule choisie : on ouvre directement le choix de paiement.
  const wanted = params.get("souscrire");
  const initialModal = wanted === "plus" || wanted === "pro" ? { type: "plans", plan: wanted } : null;

  if (!data) return <Boot />;
  return <AppView data={data} demo={demo} actions={actions} initialModal={initialModal} />;
}

export default function Page() { return <Suspense fallback={<Boot />}><App /></Suspense>; }
