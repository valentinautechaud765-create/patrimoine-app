"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppView from "../components/app/AppView.js";
import { BrandMark } from "../components/Brand.js";
import { supabaseBrowser, supabaseConfigured } from "../../lib/supabase.js";
import { demoData } from "../../lib/demo.js";
import { OWNER_EMAILS } from "../../lib/config.js";
import { computeModel } from "../../lib/model.js";

const NUM = ["amount", "quantity", "cost_basis", "value", "balance", "monthly_limit", "total"];
const clean = (r) => { const o = { ...r }; NUM.forEach((k) => { if (k in o) o[k] = Number(o[k]) || 0; }); return o; };
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
    if (demo) { setData({ ...demoData(), session: null }); return; }
    const sb = supabaseBrowser();
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { router.replace("/connexion"); return; }
    // Chaque requête ne renvoie que les lignes de l'utilisateur connecté (règles RLS côté base).
    const [profile, accounts, holdings, transactions, budgets, snapshots] = await Promise.all([
      sb.from("profiles").select("*").eq("id", s.session.user.id).maybeSingle(),
      sb.from("accounts").select("*").order("created_at"),
      sb.from("holdings").select("*").order("value", { ascending: false }),
      sb.from("transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
      sb.from("budgets").select("*"),
      sb.from("net_worth_snapshots").select("date,total").order("date"),
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
    async saveTransaction(t) {
      const before = t.id ? live.current.transactions.find((x) => x.id === t.id) : null;
      const saved = await write("transactions", t);
      replace("transactions", { ...before, ...t, ...saved }, byDate);
      const deltas = {};
      if (before?.account_id) deltas[before.account_id] = (deltas[before.account_id] || 0) - Number(before.amount);
      if (saved.account_id) deltas[saved.account_id] = (deltas[saved.account_id] || 0) + Number(saved.amount);
      for (const [acc, delta] of Object.entries(deltas)) await shiftBalance(acc, Math.round(delta * 100) / 100);
      return { message: before ? "Opération modifiée" : "Opération ajoutée" };
    },
    async deleteTransaction(t) {
      await erase("transactions", { id: t.id });
      drop("transactions", t.id);
      if (t.account_id) await shiftBalance(t.account_id, -Number(t.amount));
      return { message: "Opération supprimée" };
    },
    async saveAccount(a) {
      const saved = await write("accounts", { ...a, updated_at: new Date().toISOString() });
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
