"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppView from "../components/app/AppView.js";
import { BrandMark } from "../components/Brand.js";
import { supabaseBrowser, supabaseConfigured } from "../../lib/supabase.js";
import { demoData } from "../../lib/demo.js";
import { OWNER_EMAILS } from "../../lib/config.js";
import { computeModel, positionFromTrades, advanceDate, firstDate } from "../../lib/model.js";

// Jeton de connexion toujours à jour : Supabase le renouvelle (il expire au bout d'une heure).
// Sans ça, un onglet resté ouvert longtemps affichait « Session expirée » alors qu'on est connecté.
async function freshToken(fallback) {
  try {
    const sb = supabaseBrowser();
    if (!sb) return fallback || null;
    let { data: { session } } = await sb.auth.getSession();
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60e3) {
      const r = await sb.auth.refreshSession();
      session = r.data?.session || session;
    }
    return session?.access_token || fallback || null;
  } catch {
    return fallback || null;
  }
}

const NUM = ["amount", "quantity", "cost_basis", "value", "balance", "monthly_limit", "total"];
const clean = (r) => { const o = { ...r }; NUM.forEach((k) => { if (k in o) o[k] = Number(o[k]) || 0; }); return o; };
const todayStr = () => new Date().toISOString().slice(0, 10);
const byDate = (l) => l.sort((a, b) => String(b.date).localeCompare(String(a.date)));

const NOTICES = {
  "paiement=ok": { text: "Abonnement activé. Bienvenue !", tone: "ok" },
  "banque=ok": { text: "Banque connectée : vos comptes et opérations ont été importés.", tone: "ok" },
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
    if (demo) { setData({ ...demoData(), trades: [], recurrences: [], debts: [], debtPayments: [], session: null }); return; }
    const sb = supabaseBrowser();
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { router.replace("/connexion"); return; }
    // Chaque requête ne renvoie que les lignes de l'utilisateur connecté (règles RLS côté base).
    const [profile, accounts, holdings, transactions, budgets, snapshots, trades, recurrences, debts, debtPayments] = await Promise.all([
      sb.from("profiles").select("*").eq("id", s.session.user.id).maybeSingle(),
      sb.from("accounts").select("*").order("created_at"),
      sb.from("holdings").select("*").order("value", { ascending: false }),
      sb.from("transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
      sb.from("budgets").select("*"),
      sb.from("net_worth_snapshots").select("date,total").order("date"),
      sb.from("trades").select("*").order("date"),
      sb.from("recurrences").select("*").order("next_date"),
      sb.from("debts").select("*").order("created_at"),
      sb.from("debt_payments").select("*").order("date", { ascending: false }),
    ]);
    const pr = profile.data || { plan: "free" };
    pr.avatar_url = s.session.user.user_metadata?.avatar_url || null;
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
      debts: num(debts.data, ["initial_amount", "remaining"]),
      debtPayments: num(debtPayments.data, ["amount"]),
      debtsMissing: Boolean(debts.error),
      session: s.session,
    });
  }, [demo, router]);

  useEffect(() => { load(); }, [load]);
  // Session tenue à jour toute seule : jeton renouvelé, retour sur l'appli après une longue pause.
  useEffect(() => {
    if (demo) return;
    const sb = supabaseBrowser();
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) setData((d) => d && ({ ...d, session }));
      if (event === "SIGNED_OUT") router.replace("/connexion");
    });
    const wake = () => { if (!document.hidden) sb.auth.startAutoRefresh?.(); else sb.auth.stopAutoRefresh?.(); };
    document.addEventListener("visibilitychange", wake);
    return () => { sub?.subscription?.unsubscribe(); document.removeEventListener("visibilitychange", wake); };
  }, [demo]); // eslint-disable-line

  // Retour de Powens : sur iPhone, la page de la banque s'ouvre dans Safari. Quand on revient dans
  // l'appli, on importe tout de suite les comptes qui viennent d'être connectés.
  const [bankNotice, setBankNotice] = useState(null);
  const bankBusy = useRef(false);
  const importAfterBank = useCallback(async () => {
    if (demo || !data?.session || bankBusy.current) return;
    let pending = 0; try { pending = Number(localStorage.getItem("patrimo.bankPending")) || 0; } catch {}
    const fromReturn = ["sync", "partiel"].includes(params.get("banque")) && !bankBusy.done;
    if (!fromReturn && (!pending || Date.now() - pending > 60 * 60e3)) return;
    bankBusy.done = true;
    bankBusy.current = true;
    try {
      localStorage.removeItem("patrimo.bankPending");
      setBankNotice({ text: "Import de vos comptes bancaires…", tone: "ok" });
      // Juste après la connexion, Powens peut encore être en train de lire la banque : on réessaie un peu.
      let r = await api("/api/powens/sync", { force: true });
      for (let i = 0; r.linked && !r.accounts && i < 5; i++) {
        setBankNotice({ text: `Votre banque transmet vos comptes… (${i + 1}/5)`, tone: "ok" });
        await new Promise((ok) => setTimeout(ok, 5000));
        r = await api("/api/powens/sync", { force: true });
      }
      if (!r.linked) setBankNotice({ text: "La banque n’a pas été reliée. Relancez « Connecter ma banque ».", tone: "bad" });
      else { await load(); setBankNotice({ text: r.newAccounts ? `Banque connectée : ${r.newAccounts} compte${r.newAccounts > 1 ? "s" : ""} ajouté${r.newAccounts > 1 ? "s" : ""}${r.transactions ? `, ${r.transactions} opérations importées` : ""}.` : r.accounts ? "Comptes bancaires à jour." : "La banque est reliée, mais elle n’a renvoyé aucun compte pour l’instant. Réessayez dans une minute avec « Synchroniser ».", tone: r.accounts ? "ok" : "bad" }); }
    } catch (e) { setBankNotice({ text: "Import bancaire : " + e.message, tone: "bad" }); }
    finally { bankBusy.current = false; }
  }, [data?.session, demo, params]); // eslint-disable-line
  useEffect(() => {
    importAfterBank();
    const v = () => { if (!document.hidden) importAfterBank(); };
    document.addEventListener("visibilitychange", v); window.addEventListener("focus", v);
    return () => { document.removeEventListener("visibilitychange", v); window.removeEventListener("focus", v); };
  }, [importAfterBank]);

  const notice = useMemo(() => {
    // Échec de la connexion bancaire : on affiche la vraie raison renvoyée par le serveur
    if (params.get("banque") === "erreur" && params.get("raison")) return { text: "Connexion bancaire : " + params.get("raison").slice(0, 220), tone: "bad" };
    if (params.get("banque") === "sync") return null;
    if (params.get("banque") === "partiel") return { text: "Banque connectée, mais l’import a échoué : " + String(params.get("raison") || "").slice(0, 200) + " — touchez « Synchroniser » dans Comptes.", tone: "bad" };
    for (const [k, v] of Object.entries(NOTICES)) { const [a, b] = k.split("="); if (params.get(a) === b) return v; }
    return null;
  }, [params]);

  // Appel d'une route serveur avec le jeton de session
  const api = useCallback(async (path, body) => {
    const call = async (token) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body || {}) });
    let r = await call(data?.session ? await freshToken(data.session.access_token) : null);
    // Jeton refusé : on force un renouvellement et on réessaie une fois
    if (r.status === 401 && data?.session) {
      const again = await supabaseBrowser()?.auth.refreshSession().then((x) => x.data?.session?.access_token).catch(() => null);
      if (again) r = await call(again);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (/n’est pas encore configur|manquant/i.test(j.error || "") && !/POWENS_|STRIPE_/.test(j.error || "")) throw new Error(path.includes("powens") ? "La connexion bancaire n’est pas encore activée. Elle arrive très bientôt." : "Le paiement en ligne n’est pas encore activé. Il arrive très bientôt.");
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
        // Compte relié à la banque : la vraie opération arrive par la synchro, on n'en crée pas une deuxième
        // (l'échéance avance quand même pour rester à jour).
        const synced = r.account_id && live.current.accounts.some((a) => a.id === r.account_id && a.powens_account_id);
        let due = r.next_date, guard = 0;
        while (due <= today && (!r.end_date || due <= r.end_date) && guard++ < 120) {
          if (!synced) rows.push({ date: due, label: r.label, amount: Number(r.amount), category: r.category, account_id: r.account_id || null, recurrence_id: r.id });
          due = advanceDate(due, r.frequency, r.day);
        }
        if (due !== r.next_date) moves.push({ id: r.id, next_date: due });
      }
      if (!rows.length && !moves.length) return;
      let created = rows.map((x, i) => ({ id: "auto" + Date.now() + i, ...x }));
      if (!demo) {
        if (rows.length) {
          const { data: ins, error } = await supabaseBrowser().from("transactions").upsert(rows.map((x) => ({ ...x, user_id: user })), { onConflict: "recurrence_id,date", ignoreDuplicates: true }).select();
          if (error) return;
          created = (ins || []).map(clean);
        }
        for (const mv of moves) await supabaseBrowser().from("recurrences").update({ next_date: mv.next_date }).eq("id", mv.id);
      }
      setData((d) => ({ ...d, transactions: byDate([...d.transactions, ...created]), recurrences: d.recurrences.map((r) => ({ ...r, ...(moves.find((m) => m.id === r.id) || {}) })) }));
      const deltas = {}; created.forEach((t) => { if (t.account_id) deltas[t.account_id] = (deltas[t.account_id] || 0) + Number(t.amount); });
      for (const [acc, delta] of Object.entries(deltas)) await shiftBalance(acc, Math.round(delta * 100) / 100);
    })();
  }, [data]); // eslint-disable-line

  // Synchro bancaire automatique et silencieuse à l'ouverture (le serveur limite à une fois toutes les 30 min)
  const autoSynced = useRef(false);
  useEffect(() => {
    if (demo || !data?.session || autoSynced.current || !data.accounts.some((a) => a.powens_account_id)) return;
    autoSynced.current = true;
    freshToken(data.session.access_token).then((token) => fetch("/api/powens/sync", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: "{}" }))
      .then((r) => r.json()).then(async (r) => {
        if (r.linked && !r.skipped) { await load(); setData((d) => d && ({ ...d, bankErrors: r.errors || [], lastSync: r.at })); }
        else if (r.at) setData((d) => d && ({ ...d, lastSync: r.at }));
      }).catch(() => {});
  }, [data?.session, data?.accounts]); // eslint-disable-line

  const actions = {
    notice: bankNotice || notice,
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
      try { localStorage.setItem("patrimo.bankPending", String(Date.now())); } catch {}
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
        if (!/rate|hidden/i.test(e.message)) throw e;
        const { rate, hidden, ...rest } = a; saved = await write("accounts", { ...rest, updated_at: new Date().toISOString() });
        replace("accounts", { ...rest, ...saved });
        return { message: "Compte enregistré. Pour le taux et le masquage, relance schema.sql dans Supabase." };
      }
      replace("accounts", { ...a, ...saved });
      return { message: a.id ? "Compte modifié" : "Compte ajouté" };
    },
    async deleteAccount(a) {
      // Compte synchronisé : supprimé aussi chez Powens (sinon la synchro le remettrait), avec ses opérations bancaires
      if (a.powens_account_id && !demo) {
        await api("/api/powens/supprimer", { accountId: a.id });
        setData((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id), transactions: d.transactions.filter((t) => !(t.account_id === a.id && t.external_id)).map((t) => t.account_id === a.id ? { ...t, account_id: null } : t) }));
        return { message: "Compte supprimé (et retiré de la synchronisation bancaire)" };
      }
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
    async saveAvatar(image) {
      if (demo) { setData((d) => ({ ...d, profile: { ...d.profile, avatar_url: image } })); return { message: image ? "Photo ajoutée (démonstration)" : "Photo retirée" }; }
      const r = await api("/api/compte/photo", image ? { image } : { remove: true });
      setData((d) => ({ ...d, profile: { ...d.profile, avatar_url: r.url } }));
      supabaseBrowser().auth.refreshSession().catch(() => {});
      return { message: image ? "Photo de profil enregistrée" : "Photo retirée" };
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
      // Même banque (« BNP » = « BNP Paribas ») : sert à retrouver un compte déjà relié à la banque
      const words = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/boursorama/g, "boursobank").split(/[^a-z0-9]+/).filter((w) => w && !["la", "le", "de", "du", "sa"].includes(w));
      const sameBank = (a, b) => { const x = words(a), y = words(b); if (!x.length || !y.length) return false; const [sm, bg] = x.length <= y.length ? [x, y] : [y, x]; return sm.every((w) => bg.includes(w)); };
      const taken = new Set();
      for (const w of wanted) {
        let hit = accIndex[keyAcc(w.name, w.institution)];
        if (!hit && w.institution) {
          // Compte déjà relié à la banque : on le réutilise au lieu de créer un doublon
          const cands = d.accounts.filter((a) => a.powens_account_id && !taken.has(a.id) && sameBank(a.institution, w.institution) && (a.kind || "courant") === w.kind);
          const sameName = cands.find((a) => String(a.name).toLowerCase().trim() === String(w.name).toLowerCase().trim());
          const nWanted = wanted.filter((x) => x.kind === w.kind && sameBank(x.institution, w.institution)).length;
          hit = sameName || (cands.length === 1 && nWanted === 1 ? cands[0] : null);
        }
        if (hit) {
          taken.add(hit.id); idMap[w.src] = hit.id;
          // Le solde d'un compte relié à la banque vient de la banque : on n'y touche pas
          if (hit.powens_account_id) updated.push(hit);
          else { const saved = await write("accounts", { id: hit.id, balance: w.balance, kind: w.kind, updated_at: new Date().toISOString() }); updated.push({ ...hit, ...saved }); }
        } else newAccounts.push(w);
      }
      const createdAcc = await insertMany("accounts", newAccounts.map(({ src, ...r }) => ({ ...r, currency: "EUR" })));
      createdAcc.forEach((a, i) => { idMap[newAccounts[i].src] = a.id; });
      // 2. Opérations (sans doublons)
      const seen = {};
      d.transactions.forEach((t) => { const k = t.date + "|" + String(t.label).toLowerCase() + "|" + Number(t.amount).toFixed(2); seen[k] = (seen[k] || 0) + 1; });
      const txRows = [], usedTx = new Set();
      for (const o of file.operations || []) {
        const amount = Math.round((o.type === "Rentrée" ? 1 : -1) * Math.abs(Number(o.montant) || 0) * 100) / 100;
        if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
        const label = String(o.libelle || o.categorie || "Opération").slice(0, 120), k = o.date + "|" + label.toLowerCase() + "|" + amount.toFixed(2);
        if (seen[k]) { seen[k]--; continue; }
        // Sur un compte relié à la banque, la même opération (même montant, à 3 jours près) y est déjà
        const acc = idMap[o.compteId];
        if (acc && d.accounts.some((a) => a.id === acc && a.powens_account_id)) {
          const twin = d.transactions.find((t) => t.account_id === acc && !usedTx.has(t.id) && Number(t.amount).toFixed(2) === amount.toFixed(2) && Math.abs(new Date(t.date) - new Date(o.date)) <= 3 * 864e5);
          if (twin) { usedTx.add(twin.id); continue; }
        }
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
      // 3 ter. Remboursements de Mon Patrimoine → dettes « Je dois »
      let debtCount = 0;
      if (!d.debtsMissing && Array.isArray(file.remboursements) && file.remboursements.length) {
        const have = new Set((d.debts || []).map((x) => (String(x.person || "") + "|" + x.label + "|" + Number(x.initial_amount).toFixed(2)).toLowerCase()));
        const debtRows = file.remboursements.filter((r) => Number(r.montantInitial) > 0).map((r) => ({ kind: "je_dois", person: String(r.personne || "").slice(0, 80) || null, label: String(r.motif || "Avance").slice(0, 120), initial_amount: Math.round(Number(r.montantInitial) * 100) / 100, remaining: Math.max(0, Math.round(Number(r.restant) * 100) / 100), start_date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : today }))
          .filter((r) => !have.has((String(r.person || "") + "|" + r.label + "|" + r.initial_amount.toFixed(2)).toLowerCase()));
        const createdD = await insertMany("debts", debtRows);
        debtCount = createdD.length;
        if (createdD.length) setData((x) => ({ ...x, debts: [...(x.debts || []), ...createdD] }));
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
      return { message: "Import terminé", ok: true, summary: { comptes: createdAcc.length + updated.length, operations: createdTx.length, ignorees: (file.operations || []).length - createdTx.length, placements: createdH.length + updH.length, transactionsBourse: tradeCount, automatiques: recCount, dettes: debtCount, budgets: budgets.length, jours: hist.length } };
    },
    // Cours de bourse en direct (serveur Patrimo → Tradegate / Yahoo / Twelve Data)
    async fetchQuotes(symbols, withDay) {
      const token = live.current?.session ? await freshToken(live.current.session.access_token) : null;
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
      const token = live.current?.session ? await freshToken(live.current.session.access_token) : null;
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
    // Synchronisation bancaire (Powens) : manuelle (bouton) ou automatique à l'ouverture
    async syncBank(force = true) {
      if (demo) return { message: "Démonstration : la synchronisation s’activera avec Powens." };
      const r = await api("/api/powens/sync", { force });
      if (!r.linked) return { message: "Aucune banque connectée pour l’instant." };
      if (r.skipped) return { message: "Déjà à jour." };
      await load();
      setData((d) => d && ({ ...d, bankErrors: r.errors || [], lastSync: r.at }));
      if (r.errors?.length) return { ok: true, message: `${r.errors[0].bank} demande une nouvelle connexion (sécurité de votre banque).` };
      if (r.removedDuplicateAccounts) return { message: `${r.removedDuplicateAccounts} compte${r.removedDuplicateAccounts > 1 ? "s" : ""} en double supprimé${r.removedDuplicateAccounts > 1 ? "s" : ""}, comptes à jour` };
      const mir = r.mirroredTransfers ? ` · ${r.mirroredTransfers} virement${r.mirroredTransfers > 1 ? "s" : ""} reporté${r.mirroredTransfers > 1 ? "s" : ""} sur vos comptes saisis à la main` : "";
      return { message: (r.transactions ? `${r.transactions} nouvelle${r.transactions > 1 ? "s" : ""} opération${r.transactions > 1 ? "s" : ""} importée${r.transactions > 1 ? "s" : ""}` : "Comptes à jour") + mir };
    },
    async disconnectBank() {
      if (demo) return { message: "Démonstration : rien n’est supprimé." };
      const r = await api("/api/powens/deconnecter");
      try { localStorage.removeItem("patrimo.bankPending"); } catch {}
      await load();
      return { message: `Banque déconnectée : ${r.comptes} compte${r.comptes > 1 ? "s" : ""} synchronisé${r.comptes > 1 ? "s" : ""} supprimé${r.comptes > 1 ? "s" : ""}. Vous pouvez la reconnecter.` };
    },
    // ---------- Dettes ----------
    async saveDebt(d) {
      if (live.current.debtsMissing) throw new Error("Mise à jour de la base nécessaire : relance supabase/schema.sql dans Supabase (SQL Editor → Run).");
      const saved = await write("debts", d);
      replace("debts", { ...d, ...saved });
      return { message: d.id ? "Dette modifiée" : "Dette ajoutée" };
    },
    async deleteDebt(d) {
      await erase("debts", { id: d.id });
      setData((x) => ({ ...x, debts: x.debts.filter((y) => y.id !== d.id), debtPayments: x.debtPayments.filter((p) => p.debt_id !== d.id) }));
      return { message: "Dette supprimée (les opérations déjà enregistrées sont conservées)" };
    },
    // Remboursement : diminue le reste dû et, si un compte est choisi, crée l'opération correspondante
    async addDebtPayment({ debt, amount, date, account_id }) {
      let txId = null;
      if (account_id) {
        const t = { date, label: (debt.kind === "on_me_doit" ? "Remboursement reçu · " : "Remboursement · ") + (debt.person || debt.label), amount: debt.kind === "on_me_doit" ? amount : -amount, category: debt.kind === "on_me_doit" ? "Remboursement" : "Dette", account_id };
        const saved = await write("transactions", t);
        replace("transactions", { ...t, ...saved }, byDate);
        await shiftBalance(account_id, Number(t.amount));
        txId = saved.id;
      }
      const p = await write("debt_payments", { debt_id: debt.id, amount, date, transaction_id: txId });
      const remaining = Math.max(0, Math.round((Number(debt.remaining) - amount) * 100) / 100);
      const d = await write("debts", { id: debt.id, remaining });
      setData((x) => ({ ...x, debtPayments: [{ debt_id: debt.id, amount, date, transaction_id: txId, ...p }, ...x.debtPayments], debts: x.debts.map((y) => y.id === debt.id ? { ...y, ...d, remaining } : y) }));
      return { message: remaining === 0 ? "Dette entièrement remboursée 🎉" : "Remboursement enregistré" };
    },
    async deleteDebtPayment(pay) {
      await erase("debt_payments", { id: pay.id });
      const debt = live.current.debts.find((d) => d.id === pay.debt_id);
      if (debt) { const remaining = Math.min(Number(debt.initial_amount), Math.round((Number(debt.remaining) + Number(pay.amount)) * 100) / 100); await write("debts", { id: debt.id, remaining }); setData((x) => ({ ...x, debts: x.debts.map((y) => y.id === debt.id ? { ...y, remaining } : y) })); }
      setData((x) => ({ ...x, debtPayments: x.debtPayments.filter((p) => p.id !== pay.id) }));
      return { message: "Remboursement annulé (l’opération sur le compte, s’il y en a une, reste à supprimer dans Opérations)" };
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
