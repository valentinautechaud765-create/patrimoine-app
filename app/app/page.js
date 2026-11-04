"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppView from "../components/app/AppView.js";
import { BrandMark } from "../components/Brand.js";
import { supabaseBrowser, supabaseConfigured } from "../../lib/supabase.js";
import { demoData } from "../../lib/demo.js";
import { OWNER_EMAILS } from "../../lib/config.js";

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
  const insert = async (table, row, key, sort) => {
    if (demo) { const item = { id: "local" + Date.now(), ...row }; setData((d) => ({ ...d, [key]: sort([...d[key], item]) })); return; }
    const { data: saved, error } = await supabaseBrowser().from(table).insert({ ...row, user_id: user }).select().single();
    if (error) throw new Error("Enregistrement impossible : " + error.message);
    const clean = { ...saved }; ["amount", "quantity", "cost_basis", "value"].forEach((k) => { if (k in clean) clean[k] = Number(clean[k]) || 0; });
    setData((d) => ({ ...d, [key]: sort([...d[key], clean]) }));
  };

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
    async addTransaction(t) {
      await insert("transactions", t, "transactions", (l) => l.sort((a, b) => String(b.date).localeCompare(String(a.date))));
      return { message: "Opération ajoutée" };
    },
    async addHolding(h) {
      await insert("holdings", h, "holdings", (l) => l.sort((a, b) => b.value - a.value));
      return { message: "Position ajoutée" };
    },
    async saveBudget(b) {
      if (!demo) {
        const { error } = await supabaseBrowser().from("budgets").upsert({ ...b, user_id: user });
        if (error) throw new Error("Enregistrement impossible : " + error.message);
      }
      setData((d) => ({ ...d, budgets: [...d.budgets.filter((x) => x.category !== b.category), b] }));
      return { message: "Budget créé" };
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
