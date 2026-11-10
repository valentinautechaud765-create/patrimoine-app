"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon.js";
import { Donut, Ring } from "../Charts.js";
import { money, money0, signed, pct, dayTitle, monthLabel, todayISO } from "../../../lib/format.js";
import { ASSET_COLORS, NEUTRAL } from "../../../lib/categories.js";
import { budgetSuggestions, FREQ_LABEL, perMonth } from "../../../lib/model.js";
import { planById, TRIAL_DAYS, BRAND, accessFor } from "../../../lib/config.js";
import { Amount, Avatar, squarePhoto, CatIcon, InstIcon, TickerIcon, Panel, Empty, Locked, ago, KIND_LABEL } from "./ui.js";
import { BudgetRow, TxRow, Upcoming } from "./Overview.js";
import { InvestProjection } from "./Projection.js";

/* ---------------- Comptes ---------------- */
export function Accounts({ m, data, connectBank, syncBank, limits, openPlans, open, go, disconnectBank }) {
  const [syncing, setSyncing] = useState(false);
  const synced = data.accounts.filter((a) => a.powens_account_id);
  const groups = useMemo(() => {
    const g = {};
    data.accounts.forEach((a) => { (g[a.institution || "Saisis à la main"] ||= []).push(a); });
    return Object.entries(g).map(([name, list]) => ({ name, list: list.sort((a, b) => b.balance - a.balance), total: list.reduce((n, a) => n + Number(a.balance), 0) })).sort((a, b) => b.total - a.total);
  }, [data.accounts]);
  const canSync = data.accounts.filter((a) => a.powens_account_id).length < limits.accounts;
  const stats = [["Comptes courants", m.cash, "card", "#7fa8ff"], ["Épargne", m.savings, "piggy", "#2ee59d"], ["Placements", m.invest, "trending", "#3d7cff"]];
  return <>
    <div className="grid g3 statsRow">
      {stats.map(([label, v, icon, c], i) => <div key={label} className="card kpi fadeIn" style={{ animationDelay: i * 40 + "ms" }}>
        <div className="kpiTop"><span>{label}</span><span className="kpiIco" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}><Icon name={icon} size={16} /></span></div>
        <b className="money">{money(v)}</b>
        <small className="muted">{m.total > 0 ? Math.round((v / m.total) * 100) + " % du patrimoine" : "—"}</small>
      </div>)}
    </div>
    <div className="grid g2">
      <button className="card actionCard fadeIn" onClick={() => open("account")}>
        <span className="actionIco"><Icon name="plus" size={20} /></span>
        <div><b>Ajouter un compte</b><small>Courant, livret, PEA… saisi à la main en 10 secondes.</small></div>
        <Icon name="chevronRight" size={18} className="faint" />
      </button>
      <button className="card actionCard blue fadeIn" onClick={() => canSync ? connectBank() : openPlans("plus")}>
        <span className="actionIco"><Icon name={canSync ? "link" : "lock"} size={20} /></span>
        <div><b>Connecter ma banque</b><small>Soldes et opérations synchronisés. Lecture seule, partenaire agréé ACPR.</small></div>
        <Icon name="chevronRight" size={18} className="faint" />
      </button>
    </div>
    {synced.length > 0 && <section className="card syncBar fadeIn">
      <span className="syncDot"><i />Synchronisé</span>
      <span className="muted">{synced.length} compte{synced.length > 1 ? "s" : ""} bancaire{synced.length > 1 ? "s" : ""} · mis à jour {ago(data.lastSync || synced.map((a) => a.updated_at).sort().pop())}</span>
      <button className="btn sm" disabled={syncing} onClick={async () => { setSyncing(true); await syncBank(); setSyncing(false); }}><Icon name="refresh" size={14} className={syncing ? "spin" : ""} />{syncing ? "Synchronisation…" : "Synchroniser"}</button>
      <button className="btn sm ghost" disabled={syncing} onClick={async () => { if (!window.confirm("Déconnecter la banque ?\n\nTous les comptes synchronisés et leurs opérations bancaires seront supprimés de Patrimo, et la connexion supprimée chez Powens. Vos comptes et opérations saisis à la main ne sont pas touchés.\n\nVous pourrez reconnecter votre banque ensuite.")) return; setSyncing(true); await disconnectBank(); setSyncing(false); }}>Déconnecter</button>
    </section>}
    <button className="card actionCard fadeIn" onClick={() => go("debts")}>
      <span className="actionIco" style={{ color: "var(--warn)" }}><Icon name="coins" size={20} /></span>
      <div><b>Dettes</b><small>{(data.debts || []).some((d) => Number(d.remaining) > 0) ? <span className="money">{money((data.debts || []).filter((d) => d.kind !== "on_me_doit").reduce((n, d) => n + Number(d.remaining), 0))} à rembourser · {money((data.debts || []).filter((d) => d.kind === "on_me_doit").reduce((n, d) => n + Number(d.remaining), 0))} qu’on vous doit</span> : "Ce que vous devez, ce qu’on vous doit, vos crédits."}</small></div>
      <Icon name="chevronRight" size={18} className="faint" />
    </button>
    {(data.bankErrors || []).map((e) => <div className="msg info" key={e.bank}><b>{e.bank}</b> demande de confirmer votre identité (sécurité de la banque, environ tous les 180 jours). <button className="link" onClick={connectBank}>Reconnecter</button></div>)}
    {groups.length ? groups.map((g, i) => <section key={g.name} className="card panel fadeIn" style={{ animationDelay: 80 + i * 40 + "ms" }}>
      <div className="instHead">
        <InstIcon name={g.name} size={44} />
        <div className="itemMain"><b style={{ fontSize: 16 }}>{g.name}</b><small>{g.list.length} compte{g.list.length > 1 ? "s" : ""}</small></div>
        <b className="num money" style={{ fontSize: 17, fontWeight: 500 }}>{money(g.total)}</b>
      </div>
      <div className="list">{g.list.map((a) => <button className={"item hover tap" + (a.hidden ? " paused" : "")} key={a.id} onClick={() => open("accountView", { id: a.id })}>
        <span className="kindIco"><Icon name={a.kind === "epargne" ? "piggy" : a.kind === "investissement" ? "trending" : "card"} size={17} /></span>
        <div className="itemMain"><b>{a.name}{a.hidden && <span className="chip" style={{ height: 20, marginLeft: 8, fontSize: 11 }}>Masqué</span>}</b><small>{KIND_LABEL[a.kind]}{a.powens_account_id ? " · synchronisé" : " · manuel"}{a.hidden ? " · non compté dans le patrimoine" : ""}</small></div>
        <div className="itemSide"><b>{money(a.balance, a.currency)}</b><small className="faint"><span className="hideNarrow">Mis à jour </span>{a.updated_at ? ago(a.updated_at) : ""}</small></div>
        <Icon name="chevronRight" size={16} className="faint" />
      </button>)}</div>
    </section>) : <section className="card panel"><Empty icon="bank" title="Ajoutez votre premier compte" text="Saisissez-le à la main, ou connectez votre banque pour que tout se mette à jour tout seul."><button className="btn primary" onClick={() => open("account")}><Icon name="plus" size={16} />Ajouter un compte</button></Empty></section>}
  </>;
}

/* ---------------- Investissements ---------------- */
export function Investments({ m, data, limits, openPlans, open, liveInfo, curve, fetchHistory }) {
  const holdings = [...data.holdings].sort((a, b) => b.value - a.value);
  const gain = m.hValue - m.cost, gainPct = m.cost > 0 ? (gain / m.cost) * 100 : 0;
  const parts = Object.entries(m.allocation).map(([label, value]) => ({ label, value, color: ASSET_COLORS[label] || "#7fa8ff" })).sort((a, b) => b.value - a.value);
  const best = holdings.filter((h) => h.cost_basis > 0).map((h) => ({ ...h, g: (h.value - h.cost_basis) / h.cost_basis })).sort((a, b) => b.g - a.g);
  const content = <>
    {curve}
    <div className="grid g3">
      <section className="card panel investHero span2">
        <div className="eyebrow">Valeur des placements{liveInfo && <span className="liveBadge" style={{ textTransform: "none", letterSpacing: 0, marginLeft: 10 }}><i className="liveDot" />en direct · {new Date(liveInfo.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}</div>
        <div className="nwAmount" style={{ fontSize: "clamp(32px, 4vw, 42px)" }}><Amount value={m.invest} /></div>
        <div className="investStats">
          {liveInfo && <div><small>Aujourd’hui</small><b className={liveInfo.dayGain >= 0 ? "ok" : "bad"}>{signed(liveInfo.dayGain)}</b></div>}
          <div><small>Plus-value latente</small><b className={gain >= 0 ? "ok" : "bad"}>{signed(gain)}</b></div>
          <div><small>Performance</small><b className={gain >= 0 ? "ok" : "bad"}>{pct(gainPct)}</b></div>
          <div><small>Montant investi</small><b>{money0(m.cost)}</b></div>
          <div><small>Lignes</small><b>{holdings.length}</b></div>
        </div>
        {best.length > 1 && <div className="podium">
          <div><small>Meilleure ligne</small><span><TickerIcon holding={best[0]} /><b>{best[0].name}</b><em className="ok">{pct(best[0].g * 100, 1)}</em></span></div>
          <div><small>Moins bonne ligne</small><span><TickerIcon holding={best[best.length - 1]} /><b>{best[best.length - 1].name}</b><em className={best[best.length - 1].g >= 0 ? "ok" : "bad"}>{pct(best[best.length - 1].g * 100, 1)}</em></span></div>
        </div>}
      </section>
      <Panel title="Répartition">
        {parts.length ? <div className="allocBox">
          <Donut parts={parts} size={148} thickness={14} center={<div><small className="muted" style={{ fontSize: 11 }}>{parts.length} classe{parts.length > 1 ? "s" : ""}</small><div className="money" style={{ fontWeight: 500 }}>{money0(m.invest)}</div></div>} />
          <div className="allocLegend">{parts.map((p) => <div key={p.label}><i className="dot" style={{ background: p.color }} /><span>{p.label}</span><b>{Math.round((p.value / (m.invest || 1)) * 100)} %</b></div>)}</div>
        </div> : <Empty icon="pie" title="Aucune répartition" text="Ajoutez une première position." />}
      </Panel>
    </div>
    <Panel title="Positions" action="Ajouter une position" onAction={() => open("holding")}>
      {holdings.length ? <div className="tableWrap"><table className="table posTable">
        <thead><tr><th>Actif</th><th>Poids</th><th>Cours</th><th>Prix de revient</th><th>Valeur</th><th>+/− value</th></tr></thead>
        <tbody>{holdings.map((h) => {
          const g = h.value - h.cost_basis, gp = h.cost_basis > 0 ? (g / h.cost_basis) * 100 : 0;
          return <tr key={h.id} className="tap" onClick={() => open("holdingView", { id: h.id })}>
            <td><div className="name"><TickerIcon holding={h} /><div className="itemMain"><b>{h.name}</b><small>{h.ticker ? h.ticker + " · " : ""}{Number(h.quantity).toLocaleString("fr-FR", { maximumFractionDigits: 6 })} part{h.quantity > 1 ? "s" : ""}</small></div></div></td>
            <td><span className="weight"><i style={{ width: Math.round((h.value / (m.hValue || 1)) * 100) + "%", background: ASSET_COLORS[h.asset_class] || "#7fa8ff" }} />{Math.round((h.value / (m.hValue || 1)) * 100)} %</span></td>
            <td>{h.live ? <div className="priceCell"><span>{money(h.live.price, h.live.currency)}</span>{h.live.changePct != null && <small className={h.live.changePct >= 0 ? "ok" : "bad"}>{pct(h.live.changePct)}</small>}</div> : <span className="faint">{h.ticker ? "—" : "Saisi"}</span>}</td>
            <td>{money(h.cost_basis, "EUR")}</td>
            <td><b style={{ fontWeight: 500 }}>{money(h.value, "EUR")}</b></td>
            <td><div className="gainCell"><span className={g >= 0 ? "ok" : "bad"}>{signed(g)}</span><small className={g >= 0 ? "ok" : "bad"}>{pct(gp)}</small></div></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty icon="trending" title="Aucune position" text="Ajoutez vos actions, ETF et cryptos pour suivre vos plus-values."><button className="btn primary sm" onClick={() => open("holding")}><Icon name="plus" size={15} />Ajouter une position</button></Empty>}
      {holdings.length > 0 && <p className="finePrint" style={{ justifyContent: "flex-start", margin: "10px 0 4px" }}><Icon name="info" size={13} />{liveInfo ? "Les lignes avec un symbole boursier suivent le cours en direct (Tradegate, Yahoo Finance). Touchez une ligne pour voir sa courbe, acheter, vendre ou ajouter un dividende." : "Ajoutez le symbole boursier d’une ligne (ex. VWCE, AAPL) pour suivre son cours en direct. Touchez une ligne pour voir sa courbe, acheter, vendre ou ajouter un dividende."}</p>}
    </Panel>
    <Panel title="Simulation d’investissement" icon="layers">
      <Locked on={!limits.projection} plan="Pro" title="Simulez vos investissements" text="Apport mensuel, durée, rendement : voyez ce que deviennent vos placements." onUnlock={() => openPlans("pro")}>
        <InvestProjection holdings={holdings} total={m.hValue} fetchHistory={fetchHistory} />
      </Locked>
    </Panel>
  </>;
  if (limits.investments) return content;
  return <Locked on title="Vos investissements, enfin clairs" text="Actions, ETF et crypto : plus-values, performance et répartition au même endroit." onUnlock={() => openPlans("plus")} className="lockedScreen">{content}</Locked>;
}

/* ---------------- Budget ---------------- */
export function Budget({ m, data, limits, openPlans, open }) {
  const limit = m.budgets.reduce((n, b) => n + Number(b.monthly_limit), 0), used = m.budgets.reduce((n, b) => n + b.spent, 0);
  const outside = Object.entries(m.byCat).filter(([c]) => !m.budgets.some((b) => b.category === c)).sort((a, b) => b[1] - a[1]);
  const canAdd = m.budgets.length < limits.budgets;
  const ratio = limit ? used / limit : 0;
  const suggestions = useMemo(() => budgetSuggestions(data.transactions, data.budgets), [data.transactions, data.budgets]);
  const add = (payload) => canAdd ? open("budget", payload) : openPlans("plus");
  return <>
    <section className="card budgetHero fadeIn">
      <div className="ringWrap">
        <Ring value={ratio} size={132} thickness={10} color={ratio > 1 ? "#ff6b7a" : ratio > m.dayOfMonth / m.daysInMonth + 0.12 ? "#ffb454" : "#3d7cff"} />
        <div className="ringCenter"><b>{Math.round(ratio * 100)} %</b><small>utilisé</small></div>
      </div>
      <div className="budgetHeroText">
        <div className="eyebrow">{monthLabel(m.month)}</div>
        <div className="nwAmount money" style={{ fontSize: "clamp(30px, 4vw, 40px)" }}>{money0(Math.max(0, limit - used))} <small>restants</small></div>
        <p className="muted budgetSum" style={{ margin: 0 }}>{money0(used)} dépensés sur {money0(limit)} budgétés · {m.daysLeft} jour{m.daysLeft > 1 ? "s" : ""} restant{m.daysLeft > 1 ? "s" : ""}</p>
        <div className="paceLegend"><span><i className="paceMark" />Rythme attendu au {m.dayOfMonth} du mois</span></div>
      </div>
      <button className="btn primary budgetAdd" onClick={() => add()}>{canAdd ? <Icon name="plus" size={16} /> : <Icon name="lock" size={15} />}Nouveau budget</button>
    </section>
    {suggestions.length > 0 && <section className="card panel fadeIn">
      <div className="panelHead"><h3><Icon name="sparkles" size={16} />Budgets suggérés</h3></div>
      <p className="muted" style={{ fontSize: 13.5, margin: "0 0 12px" }}>Calculés sur vos dépenses moyennes des derniers mois. Un clic pour les créer.</p>
      <div className="suggestGrid">{suggestions.map((s) => <button key={s.category} className="suggest" onClick={() => add({ suggested: s })}>
        <CatIcon category={s.category} size={36} />
        <div className="itemMain"><b>{s.category}</b><small>Moyenne {money0(s.average)} / mois</small></div>
        <span className="chip blue">{money0(s.suggested)}</span>
      </button>)}</div>
    </section>}
    <div className="grid g3">
      <Panel title="Mes budgets" className="span2">
        {m.budgets.length ? m.budgets.map((b) => <BudgetRow key={b.category} b={b} onClick={() => open("budget", { budget: b })} />) : <Empty icon="target" title="Aucun budget" text="Choisissez une catégorie et un plafond mensuel : la barre blanche vous montre où vous devriez en être aujourd’hui."><button className="btn primary sm" onClick={() => add()}><Icon name="plus" size={15} />Créer un budget</button></Empty>}
        {!canAdd && <div className="hint" style={{ marginTop: 8 }}><Icon name="info" size={15} />Essentiel inclut {limits.budgets} budgets. Plus les rend illimités.</div>}
      </Panel>
      <div className="stack">
        <Panel title="Hors budget">
          {outside.length ? <div className="list">{outside.map(([c, v]) => <button className="item hover tap" key={c} onClick={() => add({ suggested: { category: c, suggested: Math.ceil(v / 10) * 10 } })}>
            <CatIcon category={c} size={34} />
            <div className="itemMain"><b>{c}</b><small>{Math.round((v / (m.spent || 1)) * 100)} % des dépenses · créer un budget</small></div>
            <div className="itemSide"><b>{money0(v)}</b></div>
          </button>)}</div> : <Empty icon="check" title="Tout est couvert" text="Toutes vos dépenses du mois ont un budget." />}
        </Panel>
        <Panel title="Charges à venir" icon="repeat">
          <Locked on={!limits.insights} title="Prélèvements à venir" text="Détectés automatiquement dans vos opérations." onUnlock={() => openPlans("plus")}>
            <Upcoming data={data} compact />
          </Locked>
        </Panel>
      </div>
    </div>
  </>;
}

/* ---------------- Opérations ---------------- */
/* ---------------- Opérations automatiques ---------------- */
function Recurrences({ data, open }) {
  const list = [...(data.recurrences || [])].sort((a, b) => (b.active - a.active) || String(a.next_date).localeCompare(String(b.next_date)));
  const acc = Object.fromEntries(data.accounts.map((a) => [a.id, a.name]));
  const active = list.filter((r) => r.active);
  const outM = -active.filter((r) => r.amount < 0).reduce((n, r) => n + perMonth(r), 0), inM = active.filter((r) => r.amount > 0).reduce((n, r) => n + perMonth(r), 0);
  const when = (r) => r.frequency === "hebdomadaire" ? "Chaque " + new Date(r.next_date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" }) : r.frequency === "annuelle" ? "Chaque année le " + new Date(r.next_date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : r.frequency === "trimestrielle" ? `Le ${r.day} tous les 3 mois` : `Le ${r.day} de chaque mois`;
  return <>
    <section className="card panel recHead fadeIn">
      <div className="recStats">
        <div><small>Revenus automatiques / mois</small><b className="ok">+{money0(inM)}</b></div>
        <div><small>Dépenses automatiques / mois</small><b>−{money0(outM)}</b></div>
        <div><small>Solde des automatiques</small><b className={inM - outM >= 0 ? "ok" : "bad"}>{inM - outM >= 0 ? "+" : "−"}{money0(Math.abs(inM - outM))}</b></div>
      </div>
      <button className="btn primary" onClick={() => open("recurrence")}><Icon name="plus" size={16} />Nouvelle opération automatique</button>
    </section>
    {data.recurrencesMissing && <div className="msg info">Pour activer les opérations automatiques, une petite mise à jour de la base est nécessaire : dans Supabase → SQL Editor, colle à nouveau <b>schema.sql</b> puis clique sur Run (aucune donnée n’est effacée).</div>}
    <section className="card panel">
      {list.length ? <div className="list">{list.map((r) => <button key={r.id} className={"item hover tap" + (r.active ? "" : " paused")} onClick={() => open("recurrence", { rec: r })}>
        <CatIcon category={r.category} />
        <div className="itemMain"><b>{r.label}{!r.active && <span className="chip" style={{ height: 20, marginLeft: 8, fontSize: 11 }}>En pause</span>}</b><small>{when(r)}{acc[r.account_id] ? " · " + acc[r.account_id] : ""}{r.end_date ? " · jusqu’au " + new Date(r.end_date + "T12:00:00").toLocaleDateString("fr-FR") : ""}</small></div>
        <div className="itemSide"><b className={r.amount > 0 ? "ok" : ""}>{r.amount > 0 ? "+" : "−"}{money(Math.abs(r.amount))}</b><small className="faint">{r.active ? "Prochaine : " + new Date(r.next_date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : FREQ_LABEL[r.frequency]}</small></div>
      </button>)}</div> : <Empty icon="repeat" title="Aucune opération automatique" text="Salaire le 7, loyer le 5, abonnements, virement vers le livret… Créez-les une fois, Patrimo les ajoute tout seul à chaque échéance."><button className="btn primary sm" onClick={() => open("recurrence")}><Icon name="plus" size={15} />Créer la première</button></Empty>}
    </section>
  </>;
}

export function Operations({ data, query, setQuery, limits, openPlans, open, flash, initialCategory = "" }) {
  const [view, setView] = useState("history");
  const [kind, setKind] = useState("all"), [category, setCategory] = useState(initialCategory), [month, setMonth] = useState("");
  const months = useMemo(() => [...new Set(data.transactions.map((t) => String(t.date).slice(0, 7)))].sort().reverse(), [data.transactions]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.transactions.filter((t) => (kind === "all" || (kind === "out" ? t.amount < 0 : t.amount > 0)) && (!category || t.category === category) && (!month || String(t.date).startsWith(month)) && (!q || (t.label + " " + t.category + " " + Math.abs(t.amount)).toLowerCase().includes(q)));
  }, [data.transactions, kind, category, month, query]);
  const days = useMemo(() => {
    const g = []; let cur = null;
    list.slice(0, 400).forEach((t) => { if (!cur || cur.date !== t.date) g.push(cur = { date: t.date, items: [], total: 0 }); cur.items.push(t); cur.total += Number(t.amount); });
    return g;
  }, [list]);
  // Les virements entre ses propres comptes (et l'épargne) ne sont ni des revenus ni des dépenses : on ne les compte pas.
  const counted = list.filter((t) => !NEUTRAL.has(t.category));
  const inSum = counted.filter((t) => t.amount > 0).reduce((n, t) => n + Number(t.amount), 0), outSum = -counted.filter((t) => t.amount < 0).reduce((n, t) => n + Number(t.amount), 0);
  const cats = [...new Set(data.transactions.map((t) => t.category))].sort();
  const filtered = kind !== "all" || category || month || query;
  function exportCsv() {
    if (!limits.export) return openPlans("pro");
    const acc = Object.fromEntries(data.accounts.map((a) => [a.id, a.name]));
    const rows = [["Date", "Libellé", "Catégorie", "Compte", "Montant"], ...list.map((t) => [t.date, t.label, t.category, acc[t.account_id] || "", String(t.amount).replace(".", ",")])];
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `${BRAND.name.toLowerCase()}-operations${month ? "-" + month : ""}.csv`; a.click();
    flash("Export téléchargé");
  }
  const switcher = <div className="seg opsSwitch"><button className={view === "history" ? "on" : ""} onClick={() => setView("history")}><Icon name="list" size={14} />Historique</button><button className={view === "auto" ? "on" : ""} onClick={() => setView("auto")}><Icon name="repeat" size={14} />Automatiques{(data.recurrences || []).filter((r) => r.active).length > 0 && <span className="countPill">{data.recurrences.filter((r) => r.active).length}</span>}</button></div>;
  if (view === "auto") return <>{switcher}<Recurrences data={data} open={open} /></>;
  return <>
    {switcher}
    <section className="card panel opsBar">
      <div className="search wide"><Icon name="search" size={16} /><input placeholder="Libellé, catégorie, montant…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button className="clear" onClick={() => setQuery("")} aria-label="Effacer"><Icon name="x" size={14} /></button>}</div>
      <div className="filters">
        {[["all", "Toutes"], ["out", "Dépenses"], ["in", "Revenus"]].map(([k, l]) => <button key={k} className={"pillBtn" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{l}</button>)}
        <span className={"selectPill" + (category ? " on" : "")}><Icon name="filter" size={13} /><select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catégorie"><option value="">Catégories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></span>
        <span className={"selectPill" + (month ? " on" : "")}><Icon name="calendar" size={13} /><select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mois"><option value="">Tous les mois</option>{months.map((mo) => <option key={mo} value={mo}>{monthLabel(mo)}</option>)}</select></span>
        {filtered && <button className="pillBtn" onClick={() => { setKind("all"); setCategory(""); setMonth(""); setQuery(""); }}><Icon name="x" size={13} />Effacer</button>}
        <div className="opsActions">
          <button className="btn sm" onClick={exportCsv}>{limits.export ? <Icon name="download" size={15} /> : <Icon name="lock" size={14} />}Export CSV</button>
          <button className="btn primary sm" onClick={() => open("tx")}><Icon name="plus" size={15} />Ajouter</button>
        </div>
      </div>
      <div className="opsSum"><span>{list.length} opération{list.length > 1 ? "s" : ""}</span><span className="ok">+{money0(inSum)}</span><span>−{money0(outSum)}</span><span className={inSum - outSum >= 0 ? "ok" : "bad"}>= {inSum - outSum >= 0 ? "+" : "−"}{money0(Math.abs(inSum - outSum))}</span></div>
    </section>
    <section className="card panel">
      {days.length ? days.map((d) => <div key={d.date}>
        <div className="dayHead"><span>{dayTitle(d.date)}</span><span className="num">{d.total >= 0 ? "+" : "−"}{money(Math.abs(d.total))}</span></div>
        <div className="list">{d.items.map((t) => <TxRow key={t.id} t={t} onClick={() => open("tx", { tx: t })} />)}</div>
      </div>) : <Empty icon="search" title={data.transactions.length ? "Aucun résultat" : "Aucune opération"} text={query ? `Rien ne correspond à « ${query} ».` : data.transactions.length ? "Aucune opération pour ce filtre." : "Ajoutez votre première dépense ou votre premier revenu."}>{!data.transactions.length && <button className="btn primary sm" onClick={() => open("tx")}><Icon name="plus" size={15} />Ajouter</button>}</Empty>}
    </section>
  </>;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}
function NotificationsPanel({ data }) {
  const token = data.session?.access_token;
  const [subscription, setSubscription] = useState(null), [prefs, setPrefs] = useState({ budget: true, bills: true, bank: true, investments: true, weekly: true });
  const [permission, setPermission] = useState(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    if (!token || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let active = true;
    navigator.serviceWorker.register("/sw.js").then((reg) => reg.pushManager.getSubscription()).then(async (sub) => {
      if (!active || !sub) return;
      setSubscription(sub);
      const r = await fetch("/api/notifications/subscribe?endpoint=" + encodeURIComponent(sub.endpoint), { headers: { Authorization: "Bearer " + token } });
      const j = await r.json();
      if (active && j.preferences) setPrefs(j.preferences);
    }).catch(() => {});
    return () => { active = false; };
  }, [token]);
  const auth = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  async function enable() {
    if (!token) { setMessage("Connecte-toi pour activer les notifications."); return; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setMessage("Les notifications push ne sont pas prises en charge par ce navigateur. Sur iPhone, ajoute Patrimo à l’écran d’accueil et ouvre-le depuis son icône."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") throw new Error("Autorisation refusée. Tu peux l’activer dans les réglages de ton iPhone.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) });
      const r = await fetch("/api/notifications/subscribe", { method: "POST", headers: auth, body: JSON.stringify({ subscription: sub.toJSON(), preferences: prefs }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Enregistrement impossible.");
      setSubscription(sub); setMessage("Notifications activées sur cet appareil.");
    } catch (e) { setMessage(e.message || "Impossible d’activer les notifications."); }
    setBusy(false);
  }
  async function disable() {
    if (!subscription) return;
    setBusy(true);
    try {
      await fetch("/api/notifications/subscribe", { method: "DELETE", headers: auth, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe(); setSubscription(null); setMessage("Notifications désactivées sur cet appareil.");
    } catch (e) { setMessage(e.message || "Désactivation impossible."); }
    setBusy(false);
  }
  async function change(key, value) {
    const next = { ...prefs, [key]: value }; setPrefs(next);
    if (!subscription) return;
    const r = await fetch("/api/notifications/subscribe", { method: "PATCH", headers: auth, body: JSON.stringify({ endpoint: subscription.endpoint, preferences: next }) });
    const j = await r.json();
    if (!r.ok) setMessage(j.error || "Impossible d’enregistrer les préférences.");
  }
  async function test() {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/notifications/test", { method: "POST", headers: auth, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Envoi impossible.");
      setMessage("Notification de test envoyée.");
    } catch (e) { setMessage(e.message); }
    setBusy(false);
  }
  const choices = [
    ["budget", "Alertes de budget", "Dépassement ou rythme de dépenses trop élevé."],
    ["bills", "Échéances à venir", "Factures et prélèvements prévus dans les 3 jours."],
    ["bank", "Activité des comptes", "Nouvelles opérations enregistrées."],
    ["investments", "Placements", "Point sur les plus-values et moins-values."],
    ["weekly", "Bilan hebdomadaire", "Résumé chaque lundi de tes revenus, dépenses et disponible quotidien."],
  ];
  return <Panel title="Notifications" icon="bell">
    <div className="list">
      <div className="item">
        <span className="kindIco"><Icon name="bell" size={17} /></span>
        <div className="itemMain"><b>{subscription ? "Notifications activées" : "Notifications sur cet appareil"}</b><small>{permission === "denied" ? "Autorisation refusée dans les réglages du navigateur." : "Reçois les alertes même lorsque Patrimo est fermé (si iOS autorise les notifications en arrière-plan)."}</small></div>
        {subscription ? <button className="btn sm" disabled={busy} onClick={disable}>Désactiver</button> : <button className="btn primary sm" disabled={busy} onClick={enable}>{busy ? "Activation…" : "Activer"}</button>}
      </div>
      {subscription && <div className="item"><div className="itemMain"><b>Vérifier la réception</b><small>Envoie une notification de test sur cet appareil.</small></div><button className="btn sm" disabled={busy} onClick={test}>Tester</button></div>}
      {choices.map(([key, title, desc]) => <label className="item switchRow" key={key}>
        <span className="itemMain"><b>{title}</b><small>{desc}</small></span>
        <input type="checkbox" className="switch" checked={prefs[key] !== false} disabled={!subscription || busy} onChange={(e) => change(key, e.target.checked)} />
      </label>)}
      {message && <small className="muted" style={{ display: "block", padding: "8px 2px" }}>{message}</small>}
    </div>
  </Panel>;
}

/* ---------------- Réglages ---------------- */
export function Settings({ data, demo, openPlans, managePlan, logout, resetPassword, saveName, saveAvatar, deleteCategory, privacy, setPrivacy, deleteMe, importData }) {
  const p = data.profile, access = demo ? { plan: p.plan, paid: true } : (p.access || accessFor(p)), plan = access.trial ? { name: "Essai gratuit" } : planById(p.plan || "free"), email = data.session?.user?.email;
  const name = p.full_name || (email ? email.split("@")[0] : "Mon compte");
  const [editName, setEditName] = useState(null), [photoBusy, setPhotoBusy] = useState(false);
  const trialLeft = access.daysLeft ?? TRIAL_DAYS;
  return <div className="settings">
    <section className="card panel profileCard fadeIn">
      <label className="avatarEdit" title="Changer la photo de profil">
        <Avatar name={name} size={56} src={p.avatar_url} />
        <span className="avatarCam"><Icon name={photoBusy ? "refresh" : "edit"} size={12} className={photoBusy ? "spin" : ""} /></span>
        <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setPhotoBusy(true); try { await saveAvatar(await squarePhoto(f)); } catch (err) { window.alert(err.message); } setPhotoBusy(false); }} />
      </label>
      {editName === null ? <>
        <div className="itemMain"><b style={{ fontSize: 18 }}>{name}</b><small>{email || "Compte de démonstration"}</small>{p.avatar_url && <button className="link" style={{ fontSize: 12 }} onClick={() => saveAvatar(null)}>Retirer la photo</button>}</div>
        <button className="btn sm" onClick={() => setEditName(p.full_name || "")}><Icon name="edit" size={14} />Modifier</button>
      </> : <form className="nameForm" onSubmit={async (e) => { e.preventDefault(); if (!editName.trim()) return; if (await saveName(editName.trim()) !== false) setEditName(null); }}>
        <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Votre prénom" maxLength={40} autoFocus />
        <button className="btn primary sm">Enregistrer</button>
        <button type="button" className="btn ghost sm" onClick={() => setEditName(null)}>Annuler</button>
      </form>}
    </section>
    <Panel title="Abonnement" icon="star">
      <div className="subRow">
        <div><div className="subPlan">{plan.name}{access.trial && <span className="chip blue">Tout débloqué</span>}{p.plan_status === "past_due" && <span className="chip warn">Paiement en attente</span>}</div>
          <small className="muted">{access.trial ? `${trialLeft > 1 ? `${trialLeft} jours restants` : `Dernières ${access.hoursLeft} h`} pour tout essayer. Ensuite, une formule est nécessaire pour continuer (vos données restent gardées).` : access.virement ? `Réglé par virement jusqu’au ${new Date(access.periodEnd).toLocaleDateString("fr-FR")}. Pour prolonger, refaites un virement avec le même code.` : p.current_period_end ? `Renouvellement le ${new Date(p.current_period_end).toLocaleDateString("fr-FR")}.` : "Accès complet actif."}</small></div>
        <div className="subBtns">
          {(access.trial || p.plan !== "pro") && <button className="btn primary sm" onClick={() => openPlans(access.paid && p.plan === "plus" ? "pro" : "plus")}><Icon name="sparkles" size={15} />{access.trial ? "Choisir ma formule" : p.plan === "plus" ? "Passer à Pro" : "Passer à Plus"}</button>}
          {p.plan !== "free" && p.stripe_customer_id && <button className="btn sm" onClick={managePlan}>Gérer</button>}
        </div>
      </div>
    </Panel>
    <Panel title="Données" icon="download">
      <div className="list">
        <button className="item hover tap" onClick={importData}><span className="kindIco"><Icon name="upload" size={17} /></span><div className="itemMain"><b>Importer depuis Mon Patrimoine</b><small>Comptes, opérations, budgets, placements et historique.</small></div><Icon name="chevronRight" size={16} className="faint" /></button>
      </div>
    </Panel>
    {(p.categories || []).length > 0 && <Panel title="Mes catégories" icon="tag">
      <div className="list">
        {p.categories.map((c) => <div className="item" key={c.type + c.name}><CatIcon category={c.name} /><div className="itemMain"><b>{c.name}</b><small>{c.type === "in" ? "Revenu" : "Dépense"}</small></div><button className="iconBtn" onClick={() => window.confirm(`Retirer la catégorie « ${c.name} » ? Les opérations déjà classées la gardent.`) && deleteCategory(c.name)} aria-label={`Retirer ${c.name}`}><Icon name="trash" size={16} /></button></div>)}
      </div>
    </Panel>}
    <Panel title="Affichage" icon="eye">
      <div className="list">
        <label className="item switchRow"><span className="kindIco"><Icon name={privacy ? "eyeOff" : "eye"} size={17} /></span><div className="itemMain"><b>Mode discret</b><small>Floute tous les montants, pratique en public.</small></div>
          <input type="checkbox" className="switch" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} /></label>
      </div>
    </Panel>
    <NotificationsPanel data={data} />
    <Panel title="Sécurité" icon="shield">
      <div className="list">
        <div className="item"><span className="kindIco"><Icon name="lock" size={17} /></span><div className="itemMain"><b>Mot de passe</b><small>Recevez un lien par e-mail pour le changer.</small></div><button className="btn sm" onClick={resetPassword}>Changer</button></div>
        <div className="item"><span className="kindIco"><Icon name="eye" size={17} /></span><div className="itemMain"><b>Accès bancaire en lecture seule</b><small>Personne ne peut faire de virement depuis {BRAND.name}.</small></div><Icon name="check" size={18} className="ok" /></div>
        <div className="item"><span className="kindIco"><Icon name="shield" size={17} /></span><div className="itemMain"><b>Données chiffrées et isolées</b><small>Vos données ne sont visibles que par vous. Jamais revendues.</small></div><Icon name="check" size={18} className="ok" /></div>
      </div>
    </Panel>
    <Panel title="Aide et informations" icon="info">
      <div className="list">
        <a className="item hover" href={`mailto:${BRAND.supportEmail}`}><span className="kindIco"><Icon name="mail" size={17} /></span><div className="itemMain"><b>Contacter le support</b><small>{BRAND.supportEmail}</small></div><Icon name="chevronRight" size={16} className="faint" /></a>
        <a className="item hover" href="/legal/cgu"><span className="kindIco"><Icon name="receipt" size={17} /></span><div className="itemMain"><b>Conditions d’utilisation</b></div><Icon name="chevronRight" size={16} className="faint" /></a>
        <a className="item hover" href="/legal/confidentialite"><span className="kindIco"><Icon name="lock" size={17} /></span><div className="itemMain"><b>Confidentialité</b></div><Icon name="chevronRight" size={16} className="faint" /></a>
      </div>
    </Panel>
    <div className="settingsEnd">
      <button className="btn block" onClick={logout}><Icon name="logout" size={16} />{demo ? "Quitter la démonstration" : "Se déconnecter"}</button>
      {!demo && <button className="link dangerLink" onClick={deleteMe}>Supprimer mon compte et mes données</button>}
    </div>
  </div>;
}
