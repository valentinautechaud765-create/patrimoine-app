"use client";
import { useMemo, useState } from "react";
import Icon from "../Icon.js";
import { Donut, Ring } from "../Charts.js";
import { money, money0, signed, pct, dayTitle, monthLabel } from "../../../lib/format.js";
import { cat, ASSET_COLORS, CATEGORIES } from "../../../lib/categories.js";
import { planById, TRIAL_DAYS, BRAND } from "../../../lib/config.js";
import { Amount, CatIcon, InstIcon, TickerIcon, Panel, Empty, Locked, ago, KIND_LABEL } from "./ui.js";
import { BudgetRow, TxRow } from "./Overview.js";

/* ---------------- Comptes ---------------- */
export function Accounts({ m, data, connectBank, limits, openPlans }) {
  const groups = useMemo(() => {
    const g = {};
    data.accounts.forEach((a) => { (g[a.institution || "Autre"] ||= []).push(a); });
    return Object.entries(g).map(([name, list]) => ({ name, list, total: list.reduce((n, a) => n + Number(a.balance), 0) })).sort((a, b) => b.total - a.total);
  }, [data.accounts]);
  const canAdd = data.accounts.length < limits.accounts;
  const stats = [["Comptes courants", m.cash, "card", "#7fa8ff"], ["Épargne", m.savings, "piggy", "#2ee59d"], ["Placements", m.invest, "trending", "#3d7cff"]];
  return <>
    <div className="grid g3">
      {stats.map(([label, v, icon, c], i) => <div key={label} className="card kpi fadeIn" style={{ animationDelay: i * 40 + "ms" }}>
        <div className="kpiTop"><span>{label}</span><span className="kpiIco" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}><Icon name={icon} size={16} /></span></div>
        <b>{money(v)}</b>
        <small className="muted">{m.total > 0 ? Math.round((v / m.total) * 100) + " % du patrimoine" : "—"}</small>
      </div>)}
    </div>
    <div className="connectCard card fadeIn">
      <span className="connectIco"><Icon name="link" size={20} /></span>
      <div><b>Connexion bancaire sécurisée</b><small>La plupart des banques françaises et européennes. Accès en lecture seule, via un prestataire agréé par l’ACPR.</small></div>
      <button className="btn primary" onClick={() => canAdd ? connectBank() : openPlans("plus")}>{canAdd ? <Icon name="plus" size={16} /> : <Icon name="lock" size={15} />}Connecter une banque</button>
    </div>
    {!canAdd && <div className="hint"><Icon name="info" size={15} />La formule Essentiel inclut {limits.accounts} compte. Passez à Plus pour en connecter autant que vous voulez.</div>}
    {groups.length ? groups.map((g, i) => <section key={g.name} className="card panel fadeIn" style={{ animationDelay: 80 + i * 40 + "ms" }}>
      <div className="instHead">
        <InstIcon name={g.name} size={44} />
        <div className="itemMain"><b style={{ fontSize: 16 }}>{g.name}</b><small>{g.list.length} compte{g.list.length > 1 ? "s" : ""}</small></div>
        <b className="num" style={{ fontSize: 17, fontWeight: 500 }}>{money(g.total)}</b>
      </div>
      <div className="list">{g.list.map((a) => <div className="item" key={a.id}>
        <span className="kindIco"><Icon name={a.kind === "epargne" ? "piggy" : a.kind === "investissement" ? "trending" : "card"} size={17} /></span>
        <div className="itemMain"><b>{a.name}</b><small>{KIND_LABEL[a.kind]}{a.powens_account_id ? " · synchronisé" : ""}</small></div>
        <div className="itemSide"><b>{money(a.balance, a.currency)}</b><small className="faint">{a.updated_at ? "Mis à jour " + ago(a.updated_at) : ""}</small></div>
      </div>)}</div>
    </section>) : <section className="card panel"><Empty icon="bank" title="Connectez votre première banque" text="Vos soldes et opérations arriveront automatiquement, chaque jour."><button className="btn primary" onClick={connectBank}><Icon name="plus" size={16} />Connecter une banque</button></Empty></section>}
  </>;
}

/* ---------------- Investissements ---------------- */
export function Investments({ m, data, limits, openPlans, addHolding }) {
  const holdings = [...data.holdings].sort((a, b) => b.value - a.value);
  const gain = m.hValue - m.cost, gainPct = m.cost > 0 ? (gain / m.cost) * 100 : 0;
  const parts = Object.entries(m.allocation).map(([label, value]) => ({ label, value, color: ASSET_COLORS[label] || "#7fa8ff" })).sort((a, b) => b.value - a.value);
  const content = <>
    <div className="grid g3">
      <section className="card panel investHero span2">
        <div className="eyebrow">Valeur des placements</div>
        <div className="nwAmount" style={{ fontSize: "clamp(32px, 4vw, 42px)" }}><Amount value={m.invest} /></div>
        <div className="investStats">
          <div><small>Plus-value latente</small><b className={gain >= 0 ? "ok" : "bad"}>{signed(gain)}</b></div>
          <div><small>Performance</small><b className={gain >= 0 ? "ok" : "bad"}>{pct(gainPct)}</b></div>
          <div><small>Montant investi</small><b>{money0(m.cost)}</b></div>
          <div><small>Lignes</small><b>{holdings.length}</b></div>
        </div>
      </section>
      <Panel title="Répartition">
        {parts.length ? <div className="allocBox">
          <Donut parts={parts} size={148} thickness={14} center={<div><small className="muted" style={{ fontSize: 11 }}>{parts.length} classe{parts.length > 1 ? "s" : ""}</small><div style={{ fontWeight: 500 }}>{money0(m.invest)}</div></div>} />
          <div className="allocLegend">{parts.map((p) => <div key={p.label}><i className="dot" style={{ background: p.color }} /><span>{p.label}</span><b>{Math.round((p.value / (m.invest || 1)) * 100)} %</b></div>)}</div>
        </div> : <Empty icon="pie" title="Aucune répartition" text="Ajoutez une première position." />}
      </Panel>
    </div>
    <Panel title="Positions" action="Ajouter une position" onAction={addHolding}>
      {holdings.length ? <div className="tableWrap"><table className="table">
        <thead><tr><th>Actif</th><th>Quantité</th><th>Prix de revient</th><th>Valeur</th><th>+/− value</th></tr></thead>
        <tbody>{holdings.map((h) => {
          const g = h.value - h.cost_basis, gp = h.cost_basis > 0 ? (g / h.cost_basis) * 100 : 0;
          return <tr key={h.id}>
            <td><div className="name"><TickerIcon holding={h} /><div className="itemMain"><b>{h.name}</b><small>{h.ticker} · {h.asset_class}</small></div></div></td>
            <td>{Number(h.quantity).toLocaleString("fr-FR", { maximumFractionDigits: 6 })}</td>
            <td>{money(h.cost_basis, h.currency)}</td>
            <td><b style={{ fontWeight: 500 }}>{money(h.value, h.currency)}</b></td>
            <td><div className="gainCell"><span className={g >= 0 ? "ok" : "bad"}>{signed(g)}</span><small className={g >= 0 ? "ok" : "bad"}>{pct(gp)}</small></div></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty icon="trending" title="Aucune position" text="Connectez votre PEA ou compte-titres, ou ajoutez vos actions, ETF et cryptos à la main."><button className="btn primary sm" onClick={addHolding}><Icon name="plus" size={15} />Ajouter une position</button></Empty>}
    </Panel>
  </>;
  if (limits.investments) return content;
  return <Locked on title="Vos investissements, enfin clairs" text="Actions, ETF et crypto : plus-values, performance et répartition au même endroit." onUnlock={() => openPlans("plus")} className="lockedScreen">{content}</Locked>;
}

/* ---------------- Budget ---------------- */
export function Budget({ m, limits, addBudget, openPlans }) {
  const limit = m.budgets.reduce((n, b) => n + Number(b.monthly_limit), 0), used = m.budgets.reduce((n, b) => n + b.spent, 0);
  const outside = Object.entries(m.byCat).filter(([c]) => !m.budgets.some((b) => b.category === c)).sort((a, b) => b[1] - a[1]);
  const canAdd = m.budgets.length < limits.budgets;
  const ratio = limit ? used / limit : 0;
  return <>
    <section className="card budgetHero fadeIn">
      <div className="ringWrap">
        <Ring value={ratio} size={132} thickness={10} color={ratio > 1 ? "#ff6b7a" : ratio > m.dayOfMonth / m.daysInMonth + 0.12 ? "#ffb454" : "#3d7cff"} />
        <div className="ringCenter"><b>{Math.round(ratio * 100)} %</b><small>utilisé</small></div>
      </div>
      <div className="budgetHeroText">
        <div className="eyebrow">{monthLabel(m.month)}</div>
        <div className="nwAmount" style={{ fontSize: "clamp(30px, 4vw, 40px)" }}>{money0(Math.max(0, limit - used))} <small>restants</small></div>
        <p className="muted" style={{ margin: 0 }}>{money0(used)} dépensés sur {money0(limit)} budgétés · {m.daysLeft} jour{m.daysLeft > 1 ? "s" : ""} restant{m.daysLeft > 1 ? "s" : ""}</p>
        <div className="paceLegend"><span><i className="paceMark" />Rythme attendu au {m.dayOfMonth} du mois</span></div>
      </div>
      <button className="btn primary budgetAdd" onClick={() => canAdd ? addBudget() : openPlans("plus")}>{canAdd ? <Icon name="plus" size={16} /> : <Icon name="lock" size={15} />}Nouveau budget</button>
    </section>
    <div className="grid g3">
      <Panel title="Mes budgets" className="span2">
        {m.budgets.length ? m.budgets.map((b) => <BudgetRow key={b.category} b={b} />) : <Empty icon="target" title="Aucun budget" text="Choisissez une catégorie et un plafond mensuel : la barre blanche vous montre où vous devriez en être aujourd’hui."><button className="btn primary sm" onClick={addBudget}><Icon name="plus" size={15} />Créer un budget</button></Empty>}
        {!canAdd && <div className="hint" style={{ marginTop: 8 }}><Icon name="info" size={15} />Essentiel inclut {limits.budgets} budgets. Plus les rend illimités.</div>}
      </Panel>
      <Panel title="Hors budget">
        {outside.length ? <div className="list">{outside.map(([c, v]) => <div className="item" key={c}>
          <CatIcon category={c} size={34} />
          <div className="itemMain"><b>{c}</b><small>{Math.round((v / (m.spent || 1)) * 100)} % des dépenses</small></div>
          <div className="itemSide"><b>{money0(v)}</b></div>
        </div>)}</div> : <Empty icon="check" title="Tout est couvert" text="Toutes vos dépenses du mois ont un budget." />}
      </Panel>
    </div>
  </>;
}

/* ---------------- Opérations ---------------- */
export function Operations({ data, query, setQuery, limits, openPlans, addTx, flash }) {
  const [kind, setKind] = useState("all"), [category, setCategory] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.transactions.filter((t) => (kind === "all" || (kind === "out" ? t.amount < 0 : t.amount > 0)) && (!category || t.category === category) && (!q || (t.label + " " + t.category).toLowerCase().includes(q)));
  }, [data.transactions, kind, category, query]);
  const days = useMemo(() => {
    const g = []; let cur = null;
    list.slice(0, 300).forEach((t) => { if (!cur || cur.date !== t.date) g.push(cur = { date: t.date, items: [], total: 0 }); cur.items.push(t); cur.total += Number(t.amount); });
    return g;
  }, [list]);
  const inSum = list.filter((t) => t.amount > 0).reduce((n, t) => n + Number(t.amount), 0), outSum = -list.filter((t) => t.amount < 0).reduce((n, t) => n + Number(t.amount), 0);
  const cats = [...new Set(data.transactions.map((t) => t.category))].sort();
  function exportCsv() {
    if (!limits.export) return openPlans("pro");
    const rows = [["Date", "Libellé", "Catégorie", "Montant"], ...list.map((t) => [t.date, t.label, t.category, String(t.amount).replace(".", ",")])];
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `${BRAND.name.toLowerCase()}-operations.csv`; a.click();
    flash("Export téléchargé");
  }
  return <>
    <section className="card panel opsBar">
      <div className="search wide"><Icon name="search" size={16} /><input placeholder="Rechercher une opération, une catégorie…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button className="clear" onClick={() => setQuery("")} aria-label="Effacer"><Icon name="x" size={14} /></button>}</div>
      <div className="filters">
        {[["all", "Toutes"], ["out", "Dépenses"], ["in", "Revenus"]].map(([k, l]) => <button key={k} className={"pillBtn" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{l}</button>)}
        <span className="selectPill"><Icon name="filter" size={13} /><select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catégorie"><option value="">Toutes catégories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></span>
        <div className="opsActions">
          <button className="btn sm" onClick={exportCsv}>{limits.export ? <Icon name="download" size={15} /> : <Icon name="lock" size={14} />}Export CSV</button>
          <button className="btn primary sm" onClick={addTx}><Icon name="plus" size={15} />Ajouter</button>
        </div>
      </div>
      <div className="opsSum"><span>{list.length} opération{list.length > 1 ? "s" : ""}</span><span className="ok">+{money0(inSum)}</span><span>−{money0(outSum)}</span></div>
    </section>
    <section className="card panel">
      {days.length ? days.map((d) => <div key={d.date}>
        <div className="dayHead"><span>{dayTitle(d.date)}</span><span className="num">{d.total >= 0 ? "+" : "−"}{money(Math.abs(d.total))}</span></div>
        <div className="list">{d.items.map((t) => <TxRow key={t.id} t={t} />)}</div>
      </div>) : <Empty icon="search" title="Aucun résultat" text={query ? `Rien ne correspond à « ${query} ».` : "Aucune opération pour ce filtre."} />}
    </section>
  </>;
}

/* ---------------- Réglages ---------------- */
export function Settings({ data, demo, openPlans, managePlan, logout, resetPassword }) {
  const p = data.profile, plan = planById(p.plan || "free"), email = data.session?.user?.email;
  const name = p.full_name || (email ? email.split("@")[0] : "Mon compte");
  return <div className="settings">
    <section className="card panel profileCard fadeIn">
      <span className="avatar lg">{name.charAt(0).toUpperCase()}</span>
      <div className="itemMain"><b style={{ fontSize: 18 }}>{name}</b><small>{email || "Compte de démonstration"}</small></div>
    </section>
    <Panel title="Abonnement" icon="star">
      <div className="subRow">
        <div><div className="subPlan">{plan.name}{p.plan_status === "trialing" && <span className="chip blue">Essai gratuit</span>}{p.plan_status === "past_due" && <span className="chip warn">Paiement en attente</span>}</div>
          <small className="muted">{p.plan === "free" ? "Formule gratuite, sans limite de durée." : p.plan_status === "trialing" ? `${p.trial_days_left ?? TRIAL_DAYS} jour${(p.trial_days_left ?? TRIAL_DAYS) > 1 ? "s" : ""} d’essai restant${(p.trial_days_left ?? TRIAL_DAYS) > 1 ? "s" : ""}. Aucun prélèvement avant la fin de l’essai.` : p.current_period_end ? `Renouvellement le ${new Date(p.current_period_end).toLocaleDateString("fr-FR")}.` : "Abonnement actif."}</small></div>
        <div className="subBtns">
          {p.plan !== "pro" && <button className="btn primary sm" onClick={() => openPlans(p.plan === "plus" ? "pro" : "plus")}><Icon name="sparkles" size={15} />{p.plan === "plus" ? "Passer à Pro" : "Passer à Plus"}</button>}
          {p.plan !== "free" && p.stripe_customer_id && <button className="btn sm" onClick={managePlan}>Gérer</button>}
        </div>
      </div>
    </Panel>
    <Panel title="Sécurité" icon="shield">
      <div className="list">
        <div className="item"><span className="kindIco"><Icon name="lock" size={17} /></span><div className="itemMain"><b>Mot de passe</b><small>Recevez un lien par e-mail pour le changer.</small></div><button className="btn sm" onClick={resetPassword}>Changer</button></div>
        <div className="item"><span className="kindIco"><Icon name="eye" size={17} /></span><div className="itemMain"><b>Accès bancaire en lecture seule</b><small>Personne ne peut faire de virement depuis {BRAND.name}.</small></div><Icon name="check" size={18} className="ok" /></div>
        <div className="item"><span className="kindIco"><Icon name="shield" size={17} /></span><div className="itemMain"><b>Données chiffrées et isolées</b><small>Vos données ne sont visibles que par vous. Jamais revendues.</small></div><Icon name="check" size={18} className="ok" /></div>
      </div>
    </Panel>
    <Panel title="Aide et informations" icon="info">
      <div className="list">
        <a className="item hover" href={`mailto:${BRAND.supportEmail}`}><span className="kindIco"><Icon name="user" size={17} /></span><div className="itemMain"><b>Contacter le support</b><small>{BRAND.supportEmail}</small></div><Icon name="chevronRight" size={16} className="faint" /></a>
        <a className="item hover" href="/legal/cgu"><span className="kindIco"><Icon name="receipt" size={17} /></span><div className="itemMain"><b>Conditions d’utilisation</b></div><Icon name="chevronRight" size={16} className="faint" /></a>
        <a className="item hover" href="/legal/confidentialite"><span className="kindIco"><Icon name="lock" size={17} /></span><div className="itemMain"><b>Confidentialité</b></div><Icon name="chevronRight" size={16} className="faint" /></a>
      </div>
    </Panel>
    <button className="btn block logoutBtn" onClick={logout}><Icon name="logout" size={16} />{demo ? "Quitter la démonstration" : "Se déconnecter"}</button>
  </div>;
}
