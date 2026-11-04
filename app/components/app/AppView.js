"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon.js";
import { BrandMark } from "../Brand.js";
import { computeModel, insights } from "../../../lib/model.js";
import { BRAND, PLANS, TRIAL_DAYS, formatPrice, planById, limitsFor } from "../../../lib/config.js";
import Overview from "./Overview.js";
import { Accounts, Investments, Budget, Operations, Settings } from "./Screens.js";
import { InsightList } from "./Overview.js";
import { HoldingSheet, TradeForm, PortfolioCurve } from "./Holding.js";
import { RecurrenceForm } from "./Forms.js";
import { Modal, Head, TxForm, AccountForm, AccountSheet, BudgetForm, HoldingForm, DeleteMeModal, ImportModal } from "./Forms.js";

export const NAV = [
  { id: "overview", label: "Vue d’ensemble", short: "Accueil", icon: "home" },
  { id: "accounts", label: "Comptes", short: "Comptes", icon: "wallet" },
  { id: "invest", label: "Investissements", short: "Placements", icon: "trending" },
  { id: "budget", label: "Budget", short: "Budget", icon: "target" },
  { id: "ops", label: "Opérations", short: "Opérations", icon: "list" },
  { id: "settings", label: "Réglages", short: "Réglages", icon: "settings" },
];

/* ---------------- Formules ---------------- */
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

/* ---------------- Coque de l'appli ---------------- */
export default function AppView({ data, demo, embedded, initialTab = "overview", actions = {}, initialModal = null }) {
  const [tab, setTab] = useState(initialTab), [modal, setModal] = useState(initialModal), [toast, setToast] = useState(null);
  const [query, setQuery] = useState(""), [bell, setBell] = useState(false), [scrolled, setScrolled] = useState(false);
  const [privacy, setPrivacyState] = useState(false), [opsCat, setOpsCat] = useState(""), [charts, setChartsState] = useState(true);
  useEffect(() => { if (embedded) return; try { setPrivacyState(localStorage.getItem("patrimo.privacy") === "1"); setChartsState(localStorage.getItem("patrimo.charts") !== "0"); } catch {} }, [embedded]);
  const setCharts = (v) => { setChartsState(v); try { localStorage.setItem("patrimo.charts", v ? "1" : "0"); } catch {} };
  const setPrivacy = (v) => { setPrivacyState(v); try { localStorage.setItem("patrimo.privacy", v ? "1" : "0"); } catch {} };
  const toastTimer = useRef(0), searchRef = useRef(null), scroller = useRef(null);
  const p0 = data.profile || { plan: "free" }, limits0 = limitsFor(p0.plan || "free");
  // ---------- Cours en direct : rafraîchis toutes les 10 s, courbe du jour toutes les 5 min ----------
  const [market, setMarket] = useState({ quotes: {}, eurPerUsd: null, intraday: {}, at: null });
  const symbols = useMemo(() => [...new Set(data.holdings.filter((h) => h.ticker && Number(h.quantity) > 0).map((h) => String(h.ticker).toUpperCase()))].sort(), [data.holdings]);
  const symKey = symbols.join(",");
  useEffect(() => {
    if (embedded || !symbols.length || !limits0.investments || !actions.fetchQuotes) return;
    let stop = false, lastDay = 0, timer = 0;
    const tick = async () => {
      const withDay = Date.now() - lastDay > 5 * 60e3;
      try {
        const r = await actions.fetchQuotes(symbols, withDay);
        if (stop) return;
        if (withDay) lastDay = Date.now();
        setMarket((m0) => ({ quotes: { ...m0.quotes, ...r.quotes }, eurPerUsd: r.eurPerUsd || m0.eurPerUsd, intraday: withDay ? r.intraday : m0.intraday, at: r.at }));
      } catch {}
      // Toutes les 10 s, calé sur l'horloge (:00, :10, :20…) comme Mon Patrimoine
      if (!stop) timer = setTimeout(tick, document.hidden ? 120e3 : 10e3 - (Date.now() % 10e3));
    };
    tick();
    const vis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); };
  }, [symKey, embedded, limits0.investments]); // eslint-disable-line
  const toEur = (price, cur) => cur === "EUR" ? price : cur === "USD" && market.eurPerUsd ? price * market.eurPerUsd : null;
  const liveData = useMemo(() => {
    if (!Object.keys(market.quotes).length) return data;
    const holdings = data.holdings.map((h) => {
      const q = market.quotes[String(h.ticker || "").toUpperCase()], qty = Number(h.quantity) || 0;
      const eur = q && qty > 0 ? toEur(q.price, q.currency) : null;
      if (!(eur > 0)) return h;
      const value = Math.round(qty * eur * 100) / 100;
      return { ...h, value, live: { price: q.price, currency: q.currency, priceEur: eur, changePct: q.changePct, source: q.source, dayGain: q.changePct != null ? value - value / (1 + q.changePct / 100) : null } };
    });
    return { ...data, holdings };
  }, [data, market]); // eslint-disable-line
  // Valeur au dernier cours enregistrée au plus toutes les 15 minutes
  const lastSync = useRef(0);
  useEffect(() => {
    if (embedded || !market.at || Date.now() - lastSync.current < 15 * 60e3) return;
    const changed = liveData.holdings.filter((h) => h.live && Math.abs(h.value - (data.holdings.find((x) => x.id === h.id)?.value || 0)) >= 0.01);
    if (!changed.length) return;
    lastSync.current = Date.now();
    actions.syncHoldingValues?.(changed).catch(() => {});
  }, [market.at]); // eslint-disable-line
  // Courbe de la journée : reste du patrimoine constant + placements cotés à chaque instant
  const dayCurve = useMemo(() => {
    const series = Object.entries(market.intraday || {});
    if (!series.length) return null;
    const lines = liveData.holdings.filter((h) => h.live && market.intraday[String(h.ticker).toUpperCase()]);
    if (!lines.length) return null;
    const totalNow = computeModel(liveData).total, base = totalNow - lines.reduce((n, h) => n + h.value, 0);
    const times = [...new Set(lines.flatMap((h) => market.intraday[String(h.ticker).toUpperCase()].points.map((x) => x.t)))].sort((a, b) => a - b);
    const pts = times.map((t) => {
      let v = base;
      for (const h of lines) {
        const d = market.intraday[String(h.ticker).toUpperCase()], arr = d.points;
        let k = arr.findIndex((x) => x.t > t); k = k < 0 ? arr.length - 1 : Math.max(0, k - 1);
        const eur = toEur(arr[k].p, d.currency); v += (Number(h.quantity) || 0) * (eur || 0);
      }
      return { date: new Date(t).toISOString(), value: Math.round(v * 100) / 100 };
    });
    pts.push({ date: new Date().toISOString(), value: Math.round(totalNow * 100) / 100 });
    return pts;
  }, [market.intraday, liveData]); // eslint-disable-line
  const liveInfo = market.at && liveData.holdings.some((h) => h.live) ? { at: market.at, dayGain: liveData.holdings.reduce((n, h) => n + (h.live?.dayGain || 0), 0) } : null;

  const m = useMemo(() => computeModel(liveData), [liveData]);
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
  const go = (t) => { setTab(t); setBell(false); if (t !== "ops") setOpsCat(""); };
  const open = (type, payload = {}) => setModal({ type, ...payload });
  const close = () => setModal(null);
  const goOps = (category) => { setOpsCat(category); setTab("ops"); };
  const average = (category) => {
    const months = [1, 2, 3].map((k) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - k); return d.toISOString().slice(0, 7); });
    const active = months.filter((mo) => data.transactions.some((t) => String(t.date).startsWith(mo))).length;
    const total = -data.transactions.filter((t) => t.category === category && t.amount < 0 && months.some((mo) => String(t.date).startsWith(mo))).reduce((n, t) => n + Number(t.amount), 0);
    return active ? total / active : 0;
  };
  const run = async (fn, ...args) => {
    try { const r = await fn?.(...args); if (r?.message) flash(r.message); return r?.ok === false ? false : (r || true); }
    catch (e) { flash(e.message || "Une erreur est survenue.", "bad"); return false; }
  };
  const title = tab === "overview" ? (first ? `Bonjour, ${first}` : "Vue d’ensemble") : NAV.find((n) => n.id === tab).label;
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const trialing = p.plan_status === "trialing", trialLeft = p.trial_days_left ?? TRIAL_DAYS;

  const screen = {
    overview: <Overview m={m} data={liveData} dayCurve={dayCurve} liveInfo={liveInfo} showChart={charts} fetchHistory={limits.investments ? actions.fetchHistory : null} eurPerUsd={market.eurPerUsd} limits={limits} go={go} openPlans={openPlans} list={list} open={open} goOps={goOps} />,
    accounts: <Accounts m={m} data={data} limits={limits} openPlans={openPlans} open={open} connectBank={() => run(actions.connectBank)} />,
    invest: <Investments m={m} data={liveData} liveInfo={liveInfo} fetchHistory={limits.investments ? actions.fetchHistory : null} curve={charts && limits.investments ? <PortfolioCurve holdings={liveData.holdings} intraday={market.intraday} eurPerUsd={market.eurPerUsd} fetchHistory={actions.fetchHistory} /> : null} limits={limits} openPlans={openPlans} open={open} />,
    budget: <Budget m={m} data={data} limits={limits} openPlans={openPlans} open={open} />,
    ops: <Operations key={opsCat} data={data} query={query} setQuery={setQuery} limits={limits} openPlans={openPlans} open={open} flash={flash} initialCategory={opsCat} />,
    settings: <Settings data={data} demo={demo} openPlans={openPlans} managePlan={() => run(actions.managePlan)} logout={() => run(actions.logout)} resetPassword={() => run(actions.resetPassword)} saveName={(n) => run(actions.saveName, n)} importData={() => open("import")} privacy={privacy} setPrivacy={setPrivacy} deleteMe={() => open("deleteMe")} />,
  }[tab];
  const viewed = modal?.type === "accountView" ? data.accounts.find((a) => a.id === modal.id) : null;
  const holdingOf = (id) => liveData.holdings.find((h) => h.id === id);
  const viewedH = modal?.type === "holdingView" || modal?.type === "trade" ? holdingOf(modal.id) : null;
  const tradesOf = (id) => (data.trades || []).filter((t) => t.holding_id === id);

  return (
    <div className={"appRoot" + (embedded ? " embedded" : "") + (privacy ? " privacy" : "")}>
      <div className="shell" ref={scroller} onScroll={embedded ? undefined : (e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        <aside className="side">
          <div className="brand"><BrandMark size={30} /><span className="navLabel">{BRAND.name}</span></div>
          {NAV.map((n) => {
            const lock = n.id === "invest" && !limits.investments;
            return <button key={n.id} className={"navItem" + (tab === n.id ? " on" : "")} onClick={() => go(n.id)}><Icon name={n.icon} size={18} /><span className="navLabel">{n.label}</span>{lock && <Icon name="lock" size={13} className="lockBadge" />}</button>;
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
            <span className="itemMain navLabel"><b>{first || "Mon compte"}</b><small>{email || (demo ? "Démonstration" : "")}</small></span>
            <Icon name="chevronRight" size={15} className="faint navLabel" />
          </button>
        </aside>

        <div className="main">
          <header className={"topbar" + (scrolled ? " scrolled" : "")}>
            <div className="topTitle"><h1>{title}</h1>{tab === "overview" && <small>{today.charAt(0).toUpperCase() + today.slice(1)}</small>}</div>
            <label className="search"><Icon name="search" size={16} /><input ref={searchRef} placeholder="Rechercher…" value={query} onChange={(e) => { setQuery(e.target.value); if (tab !== "ops") setTab("ops"); }} /><kbd>⌘K</kbd></label>
            <button className="iconBtn" aria-label={privacy ? "Afficher les montants" : "Masquer les montants"} title={privacy ? "Afficher les montants" : "Masquer les montants"} onClick={() => setPrivacy(!privacy)}><Icon name={privacy ? "eyeOff" : "eye"} size={18} /></button>
            <button className={"iconBtn" + (charts ? " active" : "")} aria-label={charts ? "Masquer les courbes" : "Afficher les courbes"} title={charts ? "Masquer les courbes" : "Afficher les courbes"} onClick={() => setCharts(!charts)}><Icon name={charts ? "chart" : "chartOff"} size={18} /></button>
            <div className="bellWrap">
              <button className="iconBtn" aria-label="Notifications" onClick={() => setBell(!bell)}><Icon name="bell" size={18} />{limits.insights && list.length > 0 && <i className="badgeDot" />}</button>
              {bell && <div className="popover"><div className="popHead">Notifications</div>{limits.insights ? <InsightList list={list} /> : <div className="muted" style={{ fontSize: 13.5, padding: "6px 0 4px" }}>Les alertes de budget et l’analyse automatique arrivent avec Plus. <button className="link" onClick={() => { setBell(false); openPlans("plus"); }}>Découvrir</button></div>}</div>}
            </div>
            <button className="btn primary sm" onClick={() => setModal({ type: "tx" })}><Icon name="plus" size={16} />Ajouter</button>
          </header>

          <header className="mobileTop">
            <div className="topTitle"><h1>{title}</h1>{tab === "overview" && <small>{today.charAt(0).toUpperCase() + today.slice(1)}</small>}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="iconBtn" aria-label={privacy ? "Afficher les montants" : "Masquer les montants"} onClick={() => setPrivacy(!privacy)}><Icon name={privacy ? "eyeOff" : "eye"} size={18} /></button>
              <button className={"iconBtn" + (charts ? " active" : "")} aria-label={charts ? "Masquer les courbes" : "Afficher les courbes"} onClick={() => setCharts(!charts)}><Icon name={charts ? "chart" : "chartOff"} size={18} /></button>
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
      {modal?.type === "tx" && <TxForm tx={modal.tx} defaultAccount={modal.account_id} accounts={data.accounts} onClose={close} onSave={(t, f) => run(actions.saveTransaction, t, f)} onDelete={(t) => run(actions.deleteTransaction, t)} />}
      {modal?.type === "account" && <AccountForm account={modal.account} onClose={close} onSave={(a) => run(actions.saveAccount, a)} onDelete={(a) => run(actions.deleteAccount, a)} />}
      {viewed && <AccountSheet account={viewed} transactions={data.transactions} onClose={close} onEdit={() => open("account", { account: viewed })} onAddTx={() => open("tx", { account_id: viewed.id })} onOpenTx={(t) => open("tx", { tx: t })} />}
      {modal?.type === "budget" && <BudgetForm budget={modal.budget} suggested={modal.suggested} existing={data.budgets.map((b) => b.category)} average={average} onClose={close} onSave={(b, prev) => run(actions.saveBudget, b, prev)} onDelete={(c) => run(actions.deleteBudget, c)} />}
      {modal?.type === "holding" && <HoldingForm holding={modal.holding} onClose={close} onSave={(h) => run(actions.saveHolding, h)} onDelete={(h) => run(actions.deleteHolding, h)} />}
      {modal?.type === "import" && <ImportModal email={email} onClose={close} onImport={(f) => run(actions.importMonPatrimoine, f)} />}
      {modal?.type === "holdingView" && viewedH && <HoldingSheet holding={viewedH} trades={tradesOf(viewedH.id)} tradesMissing={data.tradesMissing} fetchHistory={actions.fetchHistory} onClose={close} onEdit={() => open("holding", { holding: data.holdings.find((h) => h.id === viewedH.id) })} onTrade={(type) => open("trade", { id: viewedH.id, tradeType: type })} onOpenTrade={(t) => open("trade", { id: viewedH.id, trade: t })} />}
      {modal?.type === "trade" && viewedH && <TradeForm holding={viewedH} trade={modal.trade} initialType={modal.tradeType} eurPerUsd={market.eurPerUsd} onClose={() => open("holdingView", { id: viewedH.id })} onSave={(t) => run(actions.saveTrade, t)} onDelete={(t) => run(actions.deleteTrade, t)} />}
      {modal?.type === "recurrence" && <RecurrenceForm rec={modal.rec} accounts={data.accounts} missing={data.recurrencesMissing} onClose={close} onSave={(r) => run(actions.saveRecurrence, r)} onDelete={(r) => run(actions.deleteRecurrence, r)} />}
      {modal?.type === "deleteMe" && <DeleteMeModal onClose={close} onConfirm={() => run(actions.deleteAccountForever)} />}
      {toast && <div className={"toast " + toast.tone}><Icon name={toast.tone === "bad" ? "info" : "check"} size={16} />{toast.text}</div>}
    </div>
  );
}
