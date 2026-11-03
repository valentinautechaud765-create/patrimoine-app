"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon.js";
import { BrandMark } from "../Brand.js";
import { computeModel, insights } from "../../../lib/model.js";
import { money, todayISO } from "../../../lib/format.js";
import { CATEGORIES, EXPENSE_CATEGORIES, ASSET_COLORS, cat } from "../../../lib/categories.js";
import { BRAND, PLANS, TRIAL_DAYS, formatPrice, planById, limitsFor } from "../../../lib/config.js";
import Overview from "./Overview.js";
import { Accounts, Investments, Budget, Operations, Settings } from "./Screens.js";
import { InsightList } from "./Overview.js";

export const NAV = [
  { id: "overview", label: "Vue d’ensemble", short: "Accueil", icon: "home" },
  { id: "accounts", label: "Comptes", short: "Comptes", icon: "wallet" },
  { id: "invest", label: "Investissements", short: "Placements", icon: "trending" },
  { id: "budget", label: "Budget", short: "Budget", icon: "target" },
  { id: "ops", label: "Opérations", short: "Opérations", icon: "list" },
  { id: "settings", label: "Réglages", short: "Réglages", icon: "settings" },
];

/* ---------------- Fenêtres ---------------- */
function Modal({ onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true">{children}</div>
  </div>;
}
const Head = ({ title, sub, onClose }) => <div className="modalHead"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div><button className="iconBtn" onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} /></button></div>;

function PlansModal({ current, initial, trialUsed, onClose, onChoose }) {
  const [plan, setPlan] = useState(initial === "pro" ? "pro" : "plus"), [billing, setBilling] = useState("yearly"), [busy, setBusy] = useState(false);
  const opts = PLANS.filter((p) => p.id !== "free");
  const sel = planById(plan), trial = plan === "plus" && !trialUsed && current !== "plus";
  return <Modal onClose={onClose}>
    <Head title="Choisir une formule" sub="Sans engagement. Annulable en deux clics." onClose={onClose} />
    <div className="seg billingSeg"><button className={billing === "monthly" ? "on" : ""} onClick={() => setBilling("monthly")}>Mensuel</button><button className={billing === "yearly" ? "on" : ""} onClick={() => setBilling("yearly")}>Annuel <span className="save">−30 %</span></button></div>
    <div className="planOpts">{opts.map((p) => {
      const price = billing === "monthly" ? p.monthly : p.yearly / 12;
      return <button key={p.id} className={"planOpt" + (plan === p.id ? " on" : "")} onClick={() => setPlan(p.id)}>
        <span className="radio" />
        <b className="planOptName">{p.name}{p.highlight && <span className="chip blue">Recommandé</span>}{current === p.id && <span className="chip">Formule actuelle</span>}</b>
        <span className="planOptPrice"><b>{formatPrice(Math.round(price * 100) / 100)}</b><span className="muted">/mois</span></span>
        <small>{billing === "yearly" ? `${formatPrice(p.yearly)} facturés une fois par an · ` : ""}{p.pitch}</small>
      </button>;
    })}</div>
    <ul className="modalFeatures">{sel.features.map((f) => <li key={f}><Icon name="check" size={15} stroke={2.4} />{f}</li>)}</ul>
    <button className="btn primary lg block" disabled={busy || current === plan} onClick={async () => { setBusy(true); await onChoose(plan, billing); setBusy(false); }}>
      {busy ? "Redirection…" : current === plan ? "Vous avez déjà cette formule" : trial ? `Commencer l’essai gratuit de ${TRIAL_DAYS} jours` : `Passer à ${sel.name}`}
    </button>
    <p className="finePrint"><Icon name="lock" size={13} />Paiement sécurisé par Stripe.{trial ? ` Rien n’est prélevé pendant ${TRIAL_DAYS} jours, et vous recevez un rappel avant la fin de l’essai.` : ""}</p>
  </Modal>;
}

function TxModal({ accounts, onClose, onSave }) {
  const [type, setType] = useState("out"), [amount, setAmount] = useState(""), [label, setLabel] = useState(""), [category, setCategory] = useState("Courses"), [date, setDate] = useState(todayISO()), [account, setAccount] = useState(""), [busy, setBusy] = useState(false);
  const cats = type === "out" ? EXPENSE_CATEGORIES : ["Salaire", "Remboursement", "Autre"];
  const value = Number(String(amount).replace(",", "."));
  async function submit(e) {
    e.preventDefault(); if (!(value > 0) || !label.trim()) return;
    setBusy(true);
    const ok = await onSave({ date, label: label.trim(), amount: type === "out" ? -value : value, category, account_id: account || null });
    setBusy(false); if (ok !== false) onClose();
  }
  return <Modal onClose={onClose}>
    <form onSubmit={submit} className="modalForm">
      <Head title="Nouvelle opération" onClose={onClose} />
      <div className="seg billingSeg"><button type="button" className={type === "out" ? "on" : ""} onClick={() => { setType("out"); setCategory("Courses"); }}>Dépense</button><button type="button" className={type === "in" ? "on" : ""} onClick={() => { setType("in"); setCategory("Salaire"); }}>Revenu</button></div>
      <label className="amountField"><span className={type === "out" ? "" : "ok"}>{type === "out" ? "−" : "+"}</span><input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} autoFocus aria-label="Montant" /><span>€</span></label>
      <label className="label">Libellé<input className="input" placeholder={type === "out" ? "Ex. Carrefour, Uber…" : "Ex. Salaire, remboursement…"} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <div className="label">Catégorie<div className="catGrid">{cats.map((c) => <button type="button" key={c} className={"catPick" + (category === c ? " on" : "")} style={{ "--c": cat(c).color }} onClick={() => setCategory(c)}><Icon name={cat(c).icon} size={18} /><span>{c}</span></button>)}</div></div>
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="label">Compte<select className="input" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Aucun</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      </div>
      <button className="btn primary lg block" disabled={busy || !(value > 0) || !label.trim()}>{busy ? "Enregistrement…" : "Ajouter l’opération"}</button>
    </form>
  </Modal>;
}

function BudgetModal({ existing, onClose, onSave }) {
  const free = EXPENSE_CATEGORIES.filter((c) => c !== "Épargne" && !existing.includes(c));
  const [category, setCategory] = useState(free[0] || ""), [limit, setLimit] = useState(""), [busy, setBusy] = useState(false);
  const value = Number(String(limit).replace(",", "."));
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => { e.preventDefault(); if (!(value > 0) || !category) return; setBusy(true); const ok = await onSave({ category, monthly_limit: value }); setBusy(false); if (ok !== false) onClose(); }}>
      <Head title="Nouveau budget" sub="Un plafond mensuel pour une catégorie." onClose={onClose} />
      <div className="label">Catégorie<div className="catGrid">{free.map((c) => <button type="button" key={c} className={"catPick" + (category === c ? " on" : "")} style={{ "--c": cat(c).color }} onClick={() => setCategory(c)}><Icon name={cat(c).icon} size={18} /><span>{c}</span></button>)}</div></div>
      <label className="amountField"><input inputMode="decimal" placeholder="0" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Plafond mensuel" /><span>€ / mois</span></label>
      <button className="btn primary lg block" disabled={busy || !(value > 0) || !category}>{busy ? "Enregistrement…" : "Créer le budget"}</button>
    </form>
  </Modal>;
}

function HoldingModal({ onClose, onSave }) {
  const [f, setF] = useState({ name: "", ticker: "", asset_class: "ETF", quantity: "", cost_basis: "", value: "" }), [busy, setBusy] = useState(false);
  const n = (v) => Number(String(v).replace(",", "."));
  const set = (k) => (e) => setF({ ...f, [k]: k === "ticker" ? e.target.value.toUpperCase() : e.target.value });
  const ok = f.name.trim() && n(f.quantity) > 0 && n(f.cost_basis) >= 0 && n(f.value) >= 0 && f.cost_basis !== "" && f.value !== "";
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => { e.preventDefault(); if (!ok) return; setBusy(true); const r = await onSave({ name: f.name.trim(), ticker: f.ticker.trim() || null, asset_class: f.asset_class, quantity: n(f.quantity), cost_basis: n(f.cost_basis), value: n(f.value), currency: "EUR" }); setBusy(false); if (r !== false) onClose(); }}>
      <Head title="Ajouter une position" sub="Action, ETF, crypto, fonds…" onClose={onClose} />
      <div className="seg billingSeg" style={{ flexWrap: "wrap" }}>{Object.keys(ASSET_COLORS).map((c) => <button type="button" key={c} className={f.asset_class === c ? "on" : ""} onClick={() => setF({ ...f, asset_class: c })}>{c}</button>)}</div>
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">Nom<input className="input" placeholder="Ex. Amundi MSCI World" value={f.name} onChange={set("name")} /></label>
        <label className="label">Symbole<input className="input" placeholder="Ex. CW8" value={f.ticker} onChange={set("ticker")} /></label>
        <label className="label">Quantité<input className="input" inputMode="decimal" value={f.quantity} onChange={set("quantity")} /></label>
        <label className="label">Montant investi (€)<input className="input" inputMode="decimal" value={f.cost_basis} onChange={set("cost_basis")} /></label>
      </div>
      <label className="label">Valeur actuelle (€)<input className="input" inputMode="decimal" value={f.value} onChange={set("value")} /></label>
      <button className="btn primary lg block" disabled={busy || !ok}>{busy ? "Enregistrement…" : "Ajouter la position"}</button>
    </form>
  </Modal>;
}

/* ---------------- Coque de l'appli ---------------- */
export default function AppView({ data, demo, embedded, initialTab = "overview", actions = {}, initialModal = null }) {
  const [tab, setTab] = useState(initialTab), [modal, setModal] = useState(initialModal), [toast, setToast] = useState(null);
  const [query, setQuery] = useState(""), [bell, setBell] = useState(false), [scrolled, setScrolled] = useState(false);
  const toastTimer = useRef(0), searchRef = useRef(null), scroller = useRef(null);
  const m = useMemo(() => computeModel(data), [data]);
  const list = useMemo(() => insights(m), [m]);
  const p = data.profile || { plan: "free" }, plan = p.plan || "free", limits = limitsFor(plan);
  const email = data.session?.user?.email, name = p.full_name || (email ? email.split("@")[0] : "");
  const first = name ? name.charAt(0).toUpperCase() + name.slice(1) : "";

  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [tab]);
  useEffect(() => {
    if (embedded) return;
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [embedded]);
  useEffect(() => { if (actions.notice) flash(actions.notice.text, actions.notice.tone); }, [actions.notice]); // eslint-disable-line

  function flash(text, tone = "ok") { clearTimeout(toastTimer.current); setToast({ text, tone }); toastTimer.current = setTimeout(() => setToast(null), 3600); }
  const openPlans = (which = "plus") => setModal({ type: "plans", plan: which });
  const go = (t) => { setTab(t); setBell(false); };
  const run = async (fn, ...args) => {
    try { const r = await fn?.(...args); if (r?.message) flash(r.message); return r?.ok !== false; }
    catch (e) { flash(e.message || "Une erreur est survenue.", "bad"); return false; }
  };
  const title = tab === "overview" ? (first ? `Bonjour, ${first}` : "Vue d’ensemble") : NAV.find((n) => n.id === tab).label;
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const trialing = p.plan_status === "trialing", trialLeft = p.trial_days_left ?? TRIAL_DAYS;

  const screen = {
    overview: <Overview m={m} data={data} limits={limits} go={go} openPlans={openPlans} list={list} />,
    accounts: <Accounts m={m} data={data} limits={limits} openPlans={openPlans} connectBank={() => run(actions.connectBank)} />,
    invest: <Investments m={m} data={data} limits={limits} openPlans={openPlans} addHolding={() => setModal({ type: "holding" })} />,
    budget: <Budget m={m} limits={limits} openPlans={openPlans} addBudget={() => setModal({ type: "budget" })} />,
    ops: <Operations data={data} query={query} setQuery={setQuery} limits={limits} openPlans={openPlans} addTx={() => setModal({ type: "tx" })} flash={flash} />,
    settings: <Settings data={data} demo={demo} openPlans={openPlans} managePlan={() => run(actions.managePlan)} logout={() => run(actions.logout)} resetPassword={() => run(actions.resetPassword)} />,
  }[tab];

  return (
    <div className={"appRoot" + (embedded ? " embedded" : "")}>
      <div className="shell" ref={scroller} onScroll={embedded ? undefined : (e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        <aside className="side">
          <div className="brand"><BrandMark size={30} /><span>{BRAND.name}</span></div>
          {NAV.map((n) => {
            const lock = n.id === "invest" && !limits.investments;
            return <button key={n.id} className={"navItem" + (tab === n.id ? " on" : "")} onClick={() => go(n.id)}><Icon name={n.icon} size={18} />{n.label}{lock && <Icon name="lock" size={13} className="lockBadge" />}</button>;
          })}
          {plan === "free" ? <div className="planCard">
            <span className="planCardIco"><Icon name="sparkles" size={16} /></span>
            <b>Passez à Plus</b><small>Comptes illimités, investissements et analyse automatique. {TRIAL_DAYS} jours offerts.</small>
            <button className="btn primary sm block" onClick={() => openPlans("plus")}>Essayer gratuitement</button>
          </div> : trialing ? <div className="planCard">
            <span className="planCardIco"><Icon name="star" size={16} /></span>
            <b>Essai {planById(plan).name}</b><small>{trialLeft} jour{trialLeft > 1 ? "s" : ""} restant{trialLeft > 1 ? "s" : ""}</small>
            <div className="bar" style={{ marginTop: 0 }}><i style={{ width: Math.max(4, (1 - trialLeft / TRIAL_DAYS) * 100) + "%", background: "var(--blue)" }} /></div>
          </div> : <div className="planCard quiet"><b>{planById(plan).name}</b><small>Merci de votre confiance.</small></div>}
          <button className="sideUser" onClick={() => go("settings")}>
            <span className="avatar">{(first || "?").charAt(0)}</span>
            <span className="itemMain"><b>{first || "Mon compte"}</b><small>{email || (demo ? "Démonstration" : "")}</small></span>
            <Icon name="chevronRight" size={15} className="faint" />
          </button>
        </aside>

        <div className="main">
          <header className={"topbar" + (scrolled ? " scrolled" : "")}>
            <div className="topTitle"><h1>{title}</h1>{tab === "overview" && <small>{today.charAt(0).toUpperCase() + today.slice(1)}</small>}</div>
            <label className="search"><Icon name="search" size={16} /><input ref={searchRef} placeholder="Rechercher…" value={query} onChange={(e) => { setQuery(e.target.value); if (tab !== "ops") setTab("ops"); }} /><kbd>⌘K</kbd></label>
            <div className="bellWrap">
              <button className="iconBtn" aria-label="Notifications" onClick={() => setBell(!bell)}><Icon name="bell" size={18} />{limits.insights && list.length > 0 && <i className="badgeDot" />}</button>
              {bell && <div className="popover"><div className="popHead">Notifications</div>{limits.insights ? <InsightList list={list} /> : <div className="muted" style={{ fontSize: 13.5, padding: "6px 0 4px" }}>Les alertes de budget et l’analyse automatique arrivent avec Plus. <button className="link" onClick={() => { setBell(false); openPlans("plus"); }}>Découvrir</button></div>}</div>}
            </div>
            <button className="btn primary sm" onClick={() => setModal({ type: "tx" })}><Icon name="plus" size={16} />Ajouter</button>
          </header>

          <header className="mobileTop">
            <div className="topTitle"><h1>{title}</h1>{tab === "overview" && <small>{today.charAt(0).toUpperCase() + today.slice(1)}</small>}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="iconBtn" aria-label="Ajouter une opération" onClick={() => setModal({ type: "tx" })}><Icon name="plus" size={18} /></button>
              <button className="avatarBtn" aria-label="Réglages" onClick={() => go("settings")}><span className="avatar">{(first || "?").charAt(0)}</span></button>
            </div>
          </header>

          <div className="content" key={tab}>
            {demo && !embedded && <div className="demoBanner"><Icon name="info" size={16} /><span><b>Démonstration</b> · tous les montants affichés sont fictifs.</span><a className="btn sm light" href="/connexion?mode=inscription">Créer mon compte</a></div>}
            {screen}
          </div>
        </div>

        <nav className="tabbar" aria-label="Navigation">
          {NAV.slice(0, 5).map((n) => <button key={n.id} className={"tab" + (tab === n.id ? " on" : "")} onClick={() => go(n.id)}><Icon name={n.icon} size={22} stroke={tab === n.id ? 2 : 1.7} /><span>{n.short}</span></button>)}
        </nav>
      </div>

      {modal?.type === "plans" && <PlansModal current={plan} initial={modal.plan} trialUsed={p.trial_used} onClose={() => setModal(null)} onChoose={(pl, b) => run(actions.checkout, pl, b)} />}
      {modal?.type === "tx" && <TxModal accounts={data.accounts} onClose={() => setModal(null)} onSave={(t) => run(actions.addTransaction, t)} />}
      {modal?.type === "budget" && <BudgetModal existing={m.budgets.map((b) => b.category)} onClose={() => setModal(null)} onSave={(b) => run(actions.saveBudget, b)} />}
      {modal?.type === "holding" && <HoldingModal onClose={() => setModal(null)} onSave={(h) => run(actions.addHolding, h)} />}
      {toast && <div className={"toast " + toast.tone}><Icon name={toast.tone === "bad" ? "info" : "check"} size={16} />{toast.text}</div>}
    </div>
  );
}
