"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "../Logo.js";
import { supabaseBrowser, supabaseConfigured } from "../../lib/supabase.js";
import { PLANS, TRIAL_DAYS, formatPrice, planById } from "../../lib/config.js";

// ---------- Formatage ----------
const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const money = (n, cur = "EUR") => cur === "EUR" ? EUR.format(Number(n) || 0) : new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format(Number(n) || 0);
const pct = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2).replace(".", ",") + " %";
const DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const CATEGORY_ICONS = { Logement: "🏠", Courses: "🛒", Transport: "🚗", Santé: "💊", Loisirs: "🎮", Shopping: "👕", Abonnements: "📱", Salaire: "💶", Restaurants: "🍽️", Autre: "•" };

// ---------- Données de démonstration (affichées uniquement en mode démo, clairement signalées) ----------
function demoData() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Historique fictif qui aboutit exactement au total des comptes et placements de démonstration.
  const target = 2418.3 + 1290.75 + 8500 + 5912.64 + 4602.5 + 1204.1 + 5620.4, days = 365, walk = [0];
  for (let i = 1; i <= days; i++) walk.push(walk[i - 1] + (rnd() - 0.44) * 120);
  const drift = walk[days], snapshots = walk.map((w, i) => ({ date: new Date(Date.now() - (days - i) * 864e5).toISOString().slice(0, 10), total: Math.round((target - drift + w - (days - i) * 9) * 100) / 100 }));
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  return {
    profile: { full_name: "Alex", plan: "plus", plan_status: "trialing" },
    accounts: [
      { id: "a1", name: "Compte courant", institution: "Revolut", kind: "courant", balance: 2418.3, currency: "EUR" },
      { id: "a2", name: "Compte joint", institution: "BoursoBank", kind: "courant", balance: 1290.75, currency: "EUR" },
      { id: "a3", name: "Livret A", institution: "BoursoBank", kind: "epargne", balance: 8500, currency: "EUR" },
      { id: "a4", name: "PEA", institution: "Trade Republic", kind: "investissement", balance: 0, currency: "EUR" },
    ],
    holdings: [
      { id: "h1", name: "ETF MSCI World", ticker: "CW8", quantity: 12, cost_basis: 5450, value: 5912.64, currency: "EUR" },
      { id: "h2", name: "Vanguard FTSE All-World", ticker: "VWCE", quantity: 35, cost_basis: 4100, value: 4602.5, currency: "EUR" },
      { id: "h3", name: "Apple", ticker: "AAPL", quantity: 5, cost_basis: 1230, value: 1204.1, currency: "EUR" },
      { id: "h4", name: "Bitcoin", ticker: "BTC", quantity: 0.09, cost_basis: 4300, value: 5620.4, currency: "EUR" },
    ],
    transactions: [
      { id: "t1", date: d(0), label: "Carrefour Market", amount: -54.2, category: "Courses" },
      { id: "t2", date: d(1), label: "Uber", amount: -14.9, category: "Transport" },
      { id: "t3", date: d(2), label: "Netflix", amount: -13.49, category: "Abonnements" },
      { id: "t4", date: d(3), label: "Salaire", amount: 2450, category: "Salaire" },
      { id: "t5", date: d(4), label: "Loyer", amount: -780, category: "Logement" },
      { id: "t6", date: d(6), label: "Le Petit Bistrot", amount: -38.5, category: "Restaurants" },
      { id: "t7", date: d(8), label: "Pharmacie", amount: -12.3, category: "Santé" },
    ],
    budgets: [{ category: "Courses", monthly_limit: 350 }, { category: "Restaurants", monthly_limit: 150 }, { category: "Transport", monthly_limit: 80 }],
    snapshots,
  };
}

// ---------- Courbe interactive : l'en-tête suit le curseur ----------
function NetWorthChart({ points, children }) {
  const [hover, setHover] = useState(null);
  const box = useRef(null), frame = useRef(0);
  const geo = useMemo(() => {
    const step = Math.max(1, Math.ceil(points.length / 260));
    const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    const vals = pts.map(p => p.total);
    if (!vals.length) return { pts, xy: [], line: "", fill: "" };
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.12 || 1;
    const xy = vals.map((v, i) => [pts.length === 1 ? 500 : i / (pts.length - 1) * 1000, 100 - (v - lo + pad) / (hi - lo + pad * 2) * 100]);
    const line = "M" + xy.map(p => p[0].toFixed(1) + " " + p[1].toFixed(2)).join(" L");
    return { pts, xy, line, fill: line + " L1000 110 L0 110 Z" };
  }, [points]);
  const up = geo.pts.length > 1 && geo.pts[geo.pts.length - 1].total >= geo.pts[0].total, color = up ? "#3d7cff" : "#ff6b7a";
  const pick = (e) => { const r = box.current.getBoundingClientRect(); const x = e.clientX; cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(() => setHover(Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * (geo.xy.length - 1)))); };
  const i = hover == null ? geo.pts.length - 1 : hover, p = geo.xy[i];
  return <>
    {children(geo.pts[i], geo.pts[0], hover != null)}
    <div className="chart" ref={box} onPointerDown={pick} onPointerMove={e => (e.pointerType === "mouse" || e.buttons) && pick(e)} onPointerLeave={() => setHover(null)} onPointerUp={e => e.pointerType !== "mouse" && setTimeout(() => setHover(null), 2500)}>
      <svg viewBox="0 0 1000 110" preserveAspectRatio="none" role="img" aria-label="Évolution du patrimoine">
        <defs><linearGradient id="nw" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={geo.fill} fill="url(#nw)" />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {hover != null && p && <><span className="rule" style={{ left: p[0] / 10 + "%" }} /><span className="dot" style={{ left: p[0] / 10 + "%", top: p[1] / 110 * 100 + "%", background: color }} /></>}
    </div>
  </>;
}

const PERIODS = [["1S", 7], ["1M", 30], ["3M", 91], ["1A", 365], ["Tout", 99999]];

function Dashboard() {
  const router = useRouter(), params = useSearchParams();
  const [data, setData] = useState(null), [demo, setDemo] = useState(!supabaseConfigured);
  const [period, setPeriod] = useState(30), [sheet, setSheet] = useState(null), [busy, setBusy] = useState(false), [toast, setToast] = useState("");
  const [billing, setBilling] = useState(params.get("billing") === "monthly" ? "monthly" : "yearly");
  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    if (!sb) { setDemo(true); setData(demoData()); return; }
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { router.replace("/connexion"); return; }
    const [profile, accounts, holdings, transactions, budgets, snapshots] = await Promise.all([
      sb.from("profiles").select("*").eq("id", s.session.user.id).maybeSingle(),
      sb.from("accounts").select("*").order("created_at"),
      sb.from("holdings").select("*").order("value", { ascending: false }),
      sb.from("transactions").select("*").order("date", { ascending: false }).limit(200),
      sb.from("budgets").select("*"),
      sb.from("net_worth_snapshots").select("date,total").order("date"),
    ]);
    setDemo(false);
    setData({ profile: profile.data || { plan: "free" }, accounts: accounts.data || [], holdings: holdings.data || [], transactions: transactions.data || [], budgets: budgets.data || [], snapshots: snapshots.data || [], session: s.session });
  }, [router]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const p = params.get("souscrire"); if (p && p !== "free") setSheet({ type: "plans", plan: p }); if (params.get("paiement") === "ok") flash("Merci ! Ton abonnement est activé."); }, [params]);

  const plan = data?.profile?.plan || "free", paid = plan !== "free";
  const totals = useMemo(() => {
    if (!data) return null;
    const cash = data.accounts.filter(a => a.kind !== "investissement").reduce((n, a) => n + Number(a.balance || 0), 0);
    const invest = data.holdings.reduce((n, h) => n + Number(h.value || 0), 0);
    const cost = data.holdings.reduce((n, h) => n + Number(h.cost_basis || 0), 0);
    const month = todayISO().slice(0, 7), tx = data.transactions.filter(t => String(t.date).startsWith(month));
    const income = tx.filter(t => t.amount > 0).reduce((n, t) => n + Number(t.amount), 0), spent = -tx.filter(t => t.amount < 0).reduce((n, t) => n + Number(t.amount), 0);
    const byCat = {}; tx.filter(t => t.amount < 0).forEach(t => { byCat[t.category || "Autre"] = (byCat[t.category || "Autre"] || 0) - Number(t.amount); });
    return { cash, invest, cost, total: cash + invest, income, spent, byCat };
  }, [data]);
  const series = useMemo(() => {
    if (!data || !totals) return [];
    const max = paid ? period : Math.min(period, 30); // formule gratuite : 30 jours d'historique
    const from = new Date(Date.now() - max * 864e5).toISOString().slice(0, 10);
    const rows = data.snapshots.filter(s => s.date >= from).map(s => ({ date: s.date, total: Number(s.total) }));
    const today = todayISO();
    return [...rows.filter(r => r.date < today), { date: today, total: totals.total, live: true }];
  }, [data, totals, period, paid]);

  async function api(path, body) {
    const token = data?.session?.access_token;
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Action impossible pour le moment.");
    return j;
  }
  async function subscribe(planId) {
    if (demo) { flash("Mode démo : le paiement sera actif une fois Stripe configuré."); return; }
    setBusy(true);
    try { const { url } = await api("/api/stripe/checkout", { plan: planId, billing }); window.location.href = url; }
    catch (e) { flash(e.message); setBusy(false); }
  }
  async function manageSubscription() {
    if (demo) { flash("Mode démo : la gestion de l’abonnement sera active une fois Stripe configuré."); return; }
    try { const { url } = await api("/api/stripe/portal"); window.location.href = url; } catch (e) { flash(e.message); }
  }
  async function connectBank() {
    if (!paid && data.accounts.length >= 1) { setSheet({ type: "plans", plan: "plus", reason: "La formule gratuite inclut 1 compte. Passe à Plus pour connecter toutes tes banques." }); return; }
    if (demo) { flash("Mode démo : la connexion bancaire sera active une fois Powens configuré."); return; }
    try { const { url } = await api("/api/powens/connect"); window.location.href = url; } catch (e) { flash(e.message); }
  }
  async function addTransaction(t) {
    if (demo) { setData(d => ({ ...d, transactions: [{ id: "n" + Date.now(), ...t }, ...d.transactions] })); setSheet(null); flash("Opération ajoutée (démo)"); return; }
    const sb = supabaseBrowser();
    const { error } = await sb.from("transactions").insert({ ...t, user_id: data.session.user.id });
    if (error) { flash(error.message); return; }
    setSheet(null); flash("Opération ajoutée"); load();
  }
  async function logout() { await supabaseBrowser()?.auth.signOut(); router.replace("/"); }

  if (!data || !totals) return <main className="appShell glow" style={{ display: "grid", placeItems: "center" }}><Logo /></main>;
  const recent = data.transactions.slice(0, 6);
  const cats = Object.entries(totals.byCat).sort((a, b) => b[1] - a[1]);

  return (
    <main className="appShell glow">
      <div className="wrap" style={{ maxWidth: 1080, paddingBottom: 60 }}>
        <header className="appTop">
          <Link href="/"><Logo /></Link>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="pill">{planById(plan).name}{data.profile.plan_status === "trialing" ? " · essai" : ""}</span>
            <button className="btn small" onClick={() => setSheet({ type: "account" })}>Compte</button>
          </div>
        </header>
        {demo && <div className="demoBar">Mode démonstration : les montants sont fictifs. Crée ton compte pour suivre ton vrai patrimoine.</div>}

        <section className="heroApp">
          <span className="eyebrow">Patrimoine total</span>
          <NetWorthChart points={series}>{(pt, first, hovering) => {
            const value = pt ? pt.total : totals.total, base = first ? first.total : value, g = value - base, gp = base > 0 ? g / base * 100 : 0;
            const t = money(value), k = t.lastIndexOf(",");
            return <div>
              <div className="amount num">{k < 0 ? t : <>{t.slice(0, k)}<small>{t.slice(k)}</small></>}</div>
              <span className={"delta num " + (g >= 0 ? "ok" : "bad")}><span style={{ color: "var(--fg)" }}>{g >= 0 ? "+" : "−"}{money(Math.abs(g))}</span>{g >= 0 ? "▲" : "▼"} {pct(gp)}</span>
              <span className="when">{hovering && pt ? (pt.live ? "Maintenant" : DAY.format(new Date(pt.date + "T12:00:00"))) : "Variation sur la période"}</span>
            </div>;
          }}</NetWorthChart>
          <div className="periods">{PERIODS.map(([l, d]) => {
            const locked = !paid && d > 30;
            return <button key={l} className={period === d ? "on" : ""} onClick={() => locked ? setSheet({ type: "plans", plan: "plus", reason: "L’historique complet est inclus dans Plus." }) : setPeriod(d)}>{l}{locked ? " 🔒" : ""}</button>;
          })}</div>
          <div className="actions">
            <button className="action pri" onClick={() => setSheet({ type: "tx" })}><i>＋</i>Ajouter</button>
            <button className="action" onClick={connectBank}><i>⇄</i>Banque</button>
            <button className="action" onClick={() => paid ? flash("Analyses détaillées : bientôt disponibles.") : setSheet({ type: "plans", plan: "pro", reason: "Les analyses avancées sont incluses dans Pro." })}><i>◷</i>Analyses</button>
            <button className="action" onClick={() => setSheet({ type: paid ? "account" : "plans", plan: "plus" })}><i>★</i>{paid ? "Abonnement" : "Passer à Plus"}</button>
          </div>
        </section>

        <div className="grid2">
          <section className="card panel">
            <div className="panelHead"><b>Comptes et épargne</b><span className="muted num">{money(totals.cash)}</span></div>
            {data.accounts.filter(a => a.kind !== "investissement").map(a => <div className="row" key={a.id}><span className="rowIco">{(a.institution || a.name).slice(0, 1).toUpperCase()}</span><span className="rowMain"><b>{a.name}</b><small>{a.institution}{a.kind === "epargne" ? " · Épargne" : ""}</small></span><span className="rowSide"><b>{money(a.balance, a.currency)}</b></span></div>)}
            {data.accounts.length === 0 && <p className="muted">Aucun compte pour l’instant.</p>}
            <button className="btn small block" style={{ margin: "10px 0 12px" }} onClick={connectBank}>⇄ Connecter une banque</button>
          </section>

          <section className={"card panel" + (paid ? "" : " lock")}>
            <div className="panelHead"><b>Investissements</b><span className="muted num">{money(totals.invest)}</span></div>
            {totals.cost > 0 && <span className={"group " + (totals.invest >= totals.cost ? "ok" : "bad")}>Plus-value latente {totals.invest >= totals.cost ? "+" : "−"}{money(Math.abs(totals.invest - totals.cost))} · {pct((totals.invest - totals.cost) / totals.cost * 100)}</span>}
            {data.holdings.map(h => { const g = h.cost_basis > 0 ? (h.value - h.cost_basis) / h.cost_basis * 100 : null; return <div className="row" key={h.id}><span className="rowIco" style={{ fontSize: 10.5, color: "var(--blue2)" }}>{(h.ticker || h.name).slice(0, 4)}</span><span className="rowMain"><b>{h.name}</b><small>{Number(h.quantity).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} part(s)</small></span><span className="rowSide"><b>{money(h.value, h.currency)}</b>{g !== null && <span className={"tag " + (g >= 0 ? "up" : "down")}>{g >= 0 ? "▲ " : "▼ "}{pct(g)}</span>}</span></div>; })}
            {data.holdings.length === 0 && <p className="muted">Connecte ton courtier ou ajoute tes placements.</p>}
            {!paid && <div className="lockVeil"><div><b>Investissements en temps réel</b><span className="muted" style={{ fontSize: 14 }}>Actions, ETF et crypto au cours en direct, avec tes plus-values.</span><button className="btn primary small" onClick={() => setSheet({ type: "plans", plan: "plus" })}>Débloquer avec Plus</button></div></div>}
          </section>

          <section className="card panel">
            <div className="panelHead"><b>Ce mois-ci</b><span className={"num " + (totals.income - totals.spent >= 0 ? "ok" : "bad")}>{totals.income - totals.spent >= 0 ? "+" : "−"}{money(Math.abs(totals.income - totals.spent))}</span></div>
            <div style={{ display: "flex", gap: 24, margin: "4px 0 10px" }}><span><small className="muted">Rentrées</small><br /><b className="ok num">+{money(totals.income)}</b></span><span><small className="muted">Dépenses</small><br /><b className="num">−{money(totals.spent)}</b></span></div>
            {data.budgets.map(b => { const s = totals.byCat[b.category] || 0, r = Math.min(100, s / b.monthly_limit * 100); return <div className="budget" key={b.category}><div><span>{CATEGORY_ICONS[b.category] || "•"} {b.category}</span><span className="muted num">{money(s)} / {money(b.monthly_limit)}</span></div><div className="bar"><i className={s > b.monthly_limit ? "over" : ""} style={{ width: r + "%" }} /></div></div>; })}
            {cats.length > 0 && data.budgets.length === 0 && cats.slice(0, 4).map(([c, v]) => <div className="budget" key={c}><div><span>{CATEGORY_ICONS[c] || "•"} {c}</span><span className="muted num">{money(v)}</span></div></div>)}
          </section>

          <section className="card panel">
            <div className="panelHead"><b>Dernières opérations</b><button onClick={() => setSheet({ type: "tx" })}>＋ Ajouter</button></div>
            {recent.map(t => <div className="row" key={t.id}><span className="rowIco" style={{ fontSize: 17 }}>{CATEGORY_ICONS[t.category] || "•"}</span><span className="rowMain"><b>{t.label}</b><small>{DAY.format(new Date(t.date + "T12:00:00"))} · {t.category}</small></span><span className="rowSide"><b className={t.amount > 0 ? "ok" : ""}>{t.amount > 0 ? "+" : "−"}{money(Math.abs(t.amount))}</b></span></div>)}
            {recent.length === 0 && <p className="muted">Aucune opération pour l’instant.</p>}
          </section>
        </div>
      </div>

      {sheet?.type === "plans" && <div className="sheet" onClick={e => e.target === e.currentTarget && setSheet(null)}><div className="card sheetBox">
        <div><span className="eyebrow">Abonnement</span><h2 style={{ margin: "6px 0 4px", fontWeight: 600, letterSpacing: "-.02em" }}>Débloque tout ton patrimoine</h2><p className="muted" style={{ margin: 0 }}>{sheet.reason || `${TRIAL_DAYS} jours gratuits, puis résiliable en un clic.`}</p></div>
        <div className="billing" style={{ margin: 0, justifySelf: "start" }}><button className={billing === "monthly" ? "on" : ""} onClick={() => setBilling("monthly")}>Mensuel</button><button className={billing === "yearly" ? "on" : ""} onClick={() => setBilling("yearly")}>Annuel<span className="save">−30 %</span></button></div>
        <div className="sheetPlans">{PLANS.filter(p => p.id !== "free").map(p => <button key={p.id} className={"sheetPlan" + (sheet.plan === p.id ? " on" : "")} onClick={() => setSheet({ ...sheet, plan: p.id })}><b>{p.name}</b><b className="num">{formatPrice(billing === "yearly" ? Math.round(p.yearly / 12 * 100) / 100 : p.monthly)} / mois</b><small>{p.pitch} {billing === "yearly" ? `Facturé ${formatPrice(p.yearly)} par an.` : ""}</small></button>)}</div>
        <button className="btn primary block" disabled={busy} onClick={() => subscribe(sheet.plan || "plus")}>{busy ? "Redirection…" : sheet.plan === "pro" ? "Passer à Pro" : `Commencer l’essai gratuit de ${TRIAL_DAYS} jours`}</button>
        <p className="muted" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>Paiement sécurisé par Stripe. Sans engagement.</p>
      </div></div>}

      {sheet?.type === "account" && <div className="sheet" onClick={e => e.target === e.currentTarget && setSheet(null)}><div className="card sheetBox">
        <h2 style={{ margin: 0, fontWeight: 600 }}>Mon compte</h2>
        <div className="row" style={{ borderTop: 0 }}><span className="rowIco">{(data.profile.full_name || data.session?.user?.email || "?").slice(0, 1).toUpperCase()}</span><span className="rowMain"><b>{data.profile.full_name || "Mon compte"}</b><small>{data.session?.user?.email || "Démonstration"}</small></span><span className="pill">{planById(plan).name}</span></div>
        {paid ? <button className="btn block" onClick={manageSubscription}>Gérer mon abonnement et mes factures</button> : <button className="btn primary block" onClick={() => setSheet({ type: "plans", plan: "plus" })}>Passer à Plus</button>}
        <button className="btn block" onClick={logout} style={{ color: "var(--bad)" }}>Se déconnecter</button>
      </div></div>}

      {sheet?.type === "tx" && <TxSheet onClose={() => setSheet(null)} onSave={addTransaction} />}
      {toast && <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 200 }} className="card msg info">{toast}</div>}
    </main>
  );
}

function TxSheet({ onClose, onSave }) {
  const [type, setType] = useState("out"), [amount, setAmount] = useState(""), [label, setLabel] = useState(""), [category, setCategory] = useState("Courses"), [date, setDate] = useState(todayISO());
  const n = Number(String(amount).replace(",", "."));
  return <div className="sheet" onClick={e => e.target === e.currentTarget && onClose()}><form className="card sheetBox" onSubmit={e => { e.preventDefault(); if (n > 0) onSave({ label: label || category, amount: type === "out" ? -n : n, category: type === "out" ? category : "Salaire", date }); }}>
    <h2 style={{ margin: 0, fontWeight: 600 }}>Nouvelle opération</h2>
    <div className="tabs2"><button type="button" className={type === "out" ? "on" : ""} onClick={() => setType("out")}>Dépense</button><button type="button" className={type === "in" ? "on" : ""} onClick={() => setType("in")}>Rentrée</button></div>
    <input className="input" inputMode="decimal" placeholder="Montant (€)" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
    <input className="input" placeholder="Libellé (ex. Carrefour)" value={label} onChange={e => setLabel(e.target.value)} />
    {type === "out" && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{Object.keys(CATEGORY_ICONS).filter(c => c !== "Salaire").map(c => <button type="button" key={c} className={"btn small" + (category === c ? " primary" : "")} onClick={() => setCategory(c)}>{CATEGORY_ICONS[c]} {c}</button>)}</div>}
    <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
    <button className="btn primary block" disabled={!(n > 0)}>Enregistrer</button>
  </form></div>;
}

export default function Page() { return <Suspense fallback={null}><Dashboard /></Suspense>; }
