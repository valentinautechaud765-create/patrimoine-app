"use client";
import { useMemo, useState } from "react";
import Icon from "../Icon.js";
import { AreaChart, Donut, FlowBars } from "../Charts.js";
import { money, money0, signed, pct, todayISO, dayLabel, monthLabel } from "../../../lib/format.js";
import { monthlySeries, recurring, advanceDate, buildWealthCurve } from "../../../lib/model.js";
import { useHistory } from "./Holding.js";
import { WealthProjection } from "./Projection.js";
import { cat } from "../../../lib/categories.js";
import { Amount, CatIcon, InstIcon, Panel, Empty, Locked, ago, KIND_LABEL } from "./ui.js";

export const PERIODS = [["1S", 7], ["1M", 30], ["3M", 91], ["1A", 365], ["Tout", Infinity]];

// Points de la courbe : historique réel + valeur actuelle calculée en direct à partir des comptes.
export function historyPoints(snapshots, total, days) {
  const today = todayISO();
  const cutoff = days === Infinity ? "" : new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const pts = snapshots.filter((s) => s.date >= cutoff && s.date < today).map((s) => ({ date: s.date, value: Number(s.total) }));
  pts.push({ date: today, value: total });
  return pts;
}

function NetWorth({ m, data, limits, openPlans, dayCurve, liveInfo, showChart = true, fetchHistory, eurPerUsd }) {
  const periods = dayCurve ? [["1J", 0], ...PERIODS] : PERIODS;
  const [label, setLabel] = useState(dayCurve ? "1J" : "1M");
  const current = periods.find((x) => x[0] === label) || periods.find((x) => x[0] === "1M");
  const days = current[1];
  // Courbe détaillée : cours de chaque placement (toutes les 15 min à 1 jour selon la période)
  const symbols = useMemo(() => [...new Set(data.holdings.filter((h) => h.ticker && (Number(h.quantity) > 0 || (data.trades || []).some((t) => t.holding_id === h.id))).map((h) => String(h.ticker).toUpperCase()))].sort(), [data.holdings, data.trades]);
  const apiPeriod = { "1S": "1S", "1M": "1M", "3M": "3M", "1A": "1A", Tout: "Max" }[current[0]];
  const hist = useHistory(fetchHistory, symbols, apiPeriod || "1M", Boolean(apiPeriod && fetchHistory && symbols.length));
  const detailed = useMemo(() => {
    if (!apiPeriod || !hist.data?.series) return null;
    let since = null;
    if (current[0] === "Tout") {
      const firsts = [...(data.trades || []).map((t) => String(t.date)), ...data.transactions.map((t) => String(t.date)), ...data.snapshots.map((x) => x.date)].filter(Boolean).sort();
      since = firsts[0] || null;
    }
    return buildWealthCurve({ series: hist.data.series, holdings: data.holdings, trades: data.trades || [], transactions: data.transactions, eurPerUsd: eurPerUsd || hist.data.eurPerUsd, totalNow: m.total, sinceISO: since });
  }, [hist.data, data.holdings, data.trades, data.transactions, data.snapshots, m.total, eurPerUsd, apiPeriod]); // eslint-disable-line
  const points = useMemo(() => current[0] === "1J" ? dayCurve : detailed && detailed.length > 2 ? detailed : historyPoints(data.snapshots, m.total, days), [data.snapshots, m.total, days, current, dayCurve, detailed]);
  const intraday = current[0] === "1J" || ((current[0] === "1S" || current[0] === "1M") && detailed);
  const when = (iso) => current[0] === "1J" ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : intraday ? new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : dayLabel(String(iso).slice(0, 10));
  const parts = [
    { label: "Comptes courants", value: m.cash, color: "#7fa8ff" },
    { label: "Épargne", value: m.savings, color: "#2ee59d" },
    { label: "Placements", value: m.invest, color: "#3d7cff" },
  ].filter((p) => p.value > 0);
  const sumParts = parts.reduce((n, p) => n + p.value, 0) || 1;
  return (
    <section className="netWorth heroOpen fadeIn">
      <AreaChart points={points} height={showChart ? 200 : 0} fade>
        {(pt, first, hovering) => {
          const delta = pt.value - first.value, rel = first.value ? (delta / Math.abs(first.value)) * 100 : 0;
          return <div className="nwTop">
            <div>
              <div className="eyebrow">Patrimoine net</div>
              <div className="nwAmount"><Amount value={pt.value} /></div>
              <div className="nwDelta">
                {points.length > 1 ? <>
                  <span className={"chip " + (delta >= 0 ? "up" : "down")}><Icon name={delta >= 0 ? "upRight" : "downLeft"} size={13} stroke={2.2} />{pct(rel)}</span>
                  <span className={delta >= 0 ? "ok" : "bad"}>{signed(delta)}</span>
                  <span className="nwWhen">{hovering ? when(pt.date) : current[0] === "Tout" ? "depuis le début" : current[0] === "1J" ? "aujourd’hui" : `sur ${({ "1S": "7 jours", "1M": "1 mois", "3M": "3 mois", "1A": "1 an" })[current[0]]}`}</span>
                </> : <span className="nwWhen">La courbe se construit jour après jour.</span>}
                {liveInfo && !hovering && <span className="liveBadge"><i className="liveDot" />Cours en direct · {new Date(liveInfo.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
              </div>
            </div>
          </div>;
        }}
      </AreaChart>
      <div className="seg heroPeriods" role="tablist" aria-label="Période">
        {periods.map(([l, d]) => {
          const lock = d > limits.historyDays;
          return <button key={l} className={l === current[0] ? "on" : ""} onClick={() => lock ? openPlans("plus") : setLabel(l)}>{l === "1J" && <i className="liveDot" />}{l}{lock && <Icon name="lock" size={11} style={{ marginLeft: 4, opacity: 0.6 }} />}</button>;
        })}
      </div>
      {parts.length > 0 && <div className="mix">
        <div className="mixBar">{parts.map((p) => <i key={p.label} style={{ width: (p.value / sumParts) * 100 + "%", background: p.color }} />)}</div>
        <div className="mixLegend">{parts.map((p) => <span key={p.label}><i className="dot" style={{ background: p.color }} />{p.label}<b>{money0(p.value)}</b></span>)}</div>
      </div>}
    </section>
  );
}

function Kpis({ m }) {
  const diff = m.prevSpentToDate > 0 ? ((m.spent - m.prevSpentToDate) / m.prevSpentToDate) * 100 : null;
  const items = [
    { icon: "card", label: "Dépensé ce mois", value: money0(m.spent), sub: diff === null ? "Premier mois suivi" : <><span className={diff <= 0 ? "ok" : "bad"}>{pct(diff, 0)}</span> <span className="muted">vs. même date le mois dernier</span></> },
    { icon: "briefcase", label: "Revenus du mois", value: money0(m.income), sub: <span className="muted">{m.income > 0 ? "Encaissés depuis le 1er" : "Aucun revenu pour l’instant"}</span> },
    { icon: "piggy", label: "Taux d’épargne", value: m.savingsRate === null ? "—" : Math.round(m.savingsRate) + " %", sub: <span className="muted">{m.saved > 0 ? `${money0(m.saved)} mis de côté` : "Revenus moins dépenses"}</span> },
    { icon: "calendar", label: "Disponible par jour", value: money0(m.perDay), sub: <span className="muted">Pendant {m.daysLeft} jour{m.daysLeft > 1 ? "s" : ""}, jusqu’à la fin du mois</span> },
  ];
  return <div className="grid g4">
    {items.map((k, i) => <div key={k.label} className="card kpi fadeIn" style={{ animationDelay: 40 + i * 40 + "ms" }}>
      <div className="kpiTop"><span>{k.label}</span><span className="kpiIco"><Icon name={k.icon} size={16} /></span></div>
      <b>{k.value}</b><small>{k.sub}</small>
    </div>)}
  </div>;
}

export function InsightList({ list }) {
  if (!list.length) return <Empty icon="sparkles" title="Rien à signaler" text="Les observations apparaîtront ici dès qu’il y aura assez d’opérations ce mois-ci." />;
  const TONE = { ok: ["var(--okSoft)", "var(--ok)"], warn: ["var(--warnSoft)", "var(--warn)"], bad: ["var(--badSoft)", "var(--bad)"] };
  return <div>{list.map((x) => <div className="insight" key={x.title}>
    <span className="insightIco" style={{ background: TONE[x.tone][0], color: TONE[x.tone][1] }}><Icon name={x.icon} size={17} /></span>
    <div><b>{x.title}</b><small>{x.text}</small></div>
  </div>)}</div>;
}

export function TxRow({ t, onClick, showDate }) {
  const Tag = onClick ? "button" : "div";
  return <Tag className={"item" + (onClick ? " hover tap" : "")} onClick={onClick}>
    <CatIcon category={t.category} />
    <div className="itemMain"><b>{t.label}</b><small>{showDate ? dayLabel(t.date) + " · " : ""}{t.category}</small></div>
    <div className="itemSide"><b className={t.amount > 0 ? "ok" : ""}>{t.amount > 0 ? "+" : "−"}{money(Math.abs(t.amount))}</b></div>
  </Tag>;
}

export function BudgetRow({ b, onClick }) {
  const over = b.spent > b.monthly_limit, fast = !over && b.pace > b.expected + 0.12;
  const color = over ? "var(--bad)" : fast ? "var(--warn)" : cat(b.category).color;
  const Tag = onClick ? "button" : "div";
  return <Tag className={"budgetRow" + (onClick ? " tap" : "")} onClick={onClick}>
    <CatIcon category={b.category} />
    <div style={{ minWidth: 0 }}>
      <div className="budgetLine"><b>{b.category}</b><span className="num"><span style={{ color: over ? "var(--bad)" : "var(--fg)" }}>{money0(b.spent)}</span><span className="muted"> / {money0(b.monthly_limit)}</span></span></div>
      <div className="bar"><i style={{ width: Math.min(100, b.pace * 100) + "%", background: color }} /><span className="pace" style={{ left: `calc(${Math.min(100, b.expected * 100)}% - 1px)` }} title="Rythme attendu à cette date" /></div>
      <small className="budgetNote">{over ? <span className="bad">Dépassé de {money0(b.spent - b.monthly_limit)}</span> : fast ? <span style={{ color: "var(--warn)" }}>Rythme élevé · reste {money0(b.monthly_limit - b.spent)}</span> : <span className="muted">Reste {money0(b.monthly_limit - b.spent)}</span>}</small>
    </div>
  </Tag>;
}

function Projection({ m, data }) {
  const [years, setYears] = useState(10), [rate, setRate] = useState(4);
  // Effort d'épargne mensuel moyen, mesuré sur les 3 derniers mois complets de l'utilisateur.
  const monthly = useMemo(() => {
    const now = new Date(), months = [1, 2, 3].map((k) => new Date(now.getFullYear(), now.getMonth() - k, 15).toISOString().slice(0, 7));
    const per = months.map((mo) => data.transactions.filter((t) => String(t.date).startsWith(mo) && t.category !== "Épargne").reduce((n, t) => n + Number(t.amount), 0));
    const known = per.filter((v, i) => data.transactions.some((t) => String(t.date).startsWith(months[i])));
    return known.length ? Math.max(0, known.reduce((a, b) => a + b, 0) / known.length) : 0;
  }, [data.transactions]);
  const pts = useMemo(() => {
    const i = rate / 100 / 12, out = [];
    let v = m.total;
    for (let k = 0; k <= years * 12; k++) {
      if (k % 3 === 0 || k === years * 12) out.push({ date: new Date(new Date().getFullYear(), new Date().getMonth() + k, 1).toISOString().slice(0, 10), value: v });
      v = v * (1 + i) + monthly;
    }
    return out;
  }, [m.total, monthly, years, rate]);
  const end = pts[pts.length - 1].value;
  return <>
    <div className="projTop">
      <div><div className="eyebrow">Dans {years} an{years > 1 ? "s" : ""}</div><div className="projAmount"><Amount value={end} /></div>
        <small className="muted">Avec {money0(monthly)} épargnés par mois (votre moyenne) et {rate} % de rendement annuel. Estimation, pas une promesse.</small></div>
    </div>
    <AreaChart points={pts} height={120} color="#2ee59d" />
    <div className="projCtl">
      <label>Horizon <b>{years} ans</b><input type="range" min="1" max="20" value={years} onChange={(e) => setYears(+e.target.value)} /></label>
      <label>Rendement <b>{rate} %</b><input type="range" min="0" max="8" step="0.5" value={rate} onChange={(e) => setRate(+e.target.value)} /></label>
    </div>
  </>;
}

// Moyennes sur les mois complets affichés (le mois en cours, incomplet, est exclu)
function FlowStats({ series }) {
  const full = series.slice(0, -1).filter((x) => x.count > 0);
  if (!full.length) return null;
  const avg = (k) => full.reduce((n, x) => n + x[k], 0) / full.length;
  const inc = avg("income"), out = avg("spent"), rate = inc > 0 ? ((inc - out) / inc) * 100 : null;
  return <div className="flowStats">
    <div><small>Revenus moyens</small><b>{money0(inc)}</b></div>
    <div><small>Dépenses moyennes</small><b>{money0(out)}</b></div>
    <div><small>Mis de côté / mois</small><b className={inc - out >= 0 ? "ok" : "bad"}>{inc - out >= 0 ? "+" : "−"}{money0(Math.abs(inc - out))}</b></div>
    {rate !== null && <div><small>Taux d’épargne moyen</small><b>{Math.round(rate)} %</b></div>}
  </div>;
}

// Premiers pas : disparaît une fois tout fait
function GettingStarted({ data, open, go }) {
  const steps = [
    { done: data.accounts.length > 0, icon: "wallet", title: "Ajouter un compte", text: "Saisissez vos comptes ou connectez votre banque.", act: () => open("account") },
    { done: data.transactions.length > 0, icon: "list", title: "Enregistrer une opération", text: "Une dépense ou un revenu, en quelques secondes.", act: () => open("tx") },
    { done: data.budgets.length > 0, icon: "target", title: "Fixer un budget", text: "Un plafond par catégorie, avec alerte de rythme.", act: () => open("budget") },
    { done: data.holdings.length > 0, icon: "trending", title: "Suivre vos placements", text: "Actions, ETF, crypto : vos plus-values au même endroit.", act: () => go("invest") },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return <section className="card panel startCard fadeIn">
    <div className="startHead">
      <div><div className="eyebrow">Bien démarrer</div><h3>Configurez votre espace en 2 minutes</h3></div>
      <div className="startProgress"><b>{done}/{steps.length}</b><div className="bar"><i style={{ width: (done / steps.length) * 100 + "%", background: "var(--blue)" }} /></div></div>
    </div>
    <div className="startSteps">{steps.map((s) => <button key={s.title} className={"startStep" + (s.done ? " done" : "")} onClick={s.act} disabled={s.done}>
      <span className="startIco"><Icon name={s.done ? "check" : s.icon} size={17} stroke={s.done ? 2.4 : 1.8} /></span>
      <span className="itemMain"><b>{s.title}</b><small>{s.done ? "Fait" : s.text}</small></span>
      {!s.done && <Icon name="chevronRight" size={16} className="faint" />}
    </button>)}</div>
  </section>;
}

function CategoryPanel({ m, goOps }) {
  const parts = Object.entries(m.byCat).map(([label, value]) => ({ label, value, color: cat(label).color })).sort((a, b) => b.value - a.value);
  if (!parts.length) return <Empty icon="pie" title="Aucune dépense ce mois-ci" text="La répartition apparaîtra dès vos premières dépenses." />;
  return <div className="catPanel">
    <Donut parts={parts} size={150} thickness={14} center={<div><small className="muted" style={{ fontSize: 11 }}>Ce mois</small><div className="money" style={{ fontWeight: 500 }}>{money0(m.spent)}</div></div>} />
    <div className="list catList">{parts.slice(0, 6).map((p) => {
      const prev = m.prevByCatToDate[p.label] || 0, diff = prev > 0 ? ((p.value - prev) / prev) * 100 : null;
      return <button key={p.label} className="item hover tap" onClick={() => goOps(p.label)}>
        <CatIcon category={p.label} size={32} />
        <div className="itemMain"><b>{p.label}</b><small>{Math.round((p.value / (m.spent || 1)) * 100)} % des dépenses</small></div>
        <div className="itemSide"><b>{money0(p.value)}</b>{diff !== null && <small className={diff > 0 ? "bad" : "ok"}>{pct(diff, 0)}</small>}</div>
      </button>;
    })}</div>
  </div>;
}

export function Upcoming({ data, compact }) {
  // Opérations automatiques programmées d'abord, puis celles détectées dans l'historique (sans doublon)
  const items = useMemo(() => {
    const today = todayISO(), horizon = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10), planned = [];
    (data.recurrences || []).filter((r) => r.active).forEach((r) => {
      let d = r.next_date, g = 0;
      while (d <= horizon && (!r.end_date || d <= r.end_date) && g++ < 10) { if (d >= today) planned.push({ label: r.label, category: r.category, amount: Number(r.amount), next: d, planned: true }); d = advanceDate(d, r.frequency, r.day); }
    });
    const names = new Set(planned.map((p) => p.label.toLowerCase().trim()));
    return [...planned, ...recurring(data.transactions).filter((r) => !names.has(String(r.label).toLowerCase().trim()))].sort((a, b) => a.next.localeCompare(b.next));
  }, [data.transactions, data.recurrences]);
  const month = todayISO().slice(0, 7), rest = items.filter((r) => r.next.startsWith(month));
  const due = -rest.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0), incoming = rest.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  if (!items.length) return <Empty icon="repeat" title="Rien de prévu pour l’instant" text="Créez vos opérations automatiques (salaire, loyer…) dans Opérations → Automatiques. Elles sont aussi détectées après deux mois d’historique." />;
  return <>
    <div className="upSum"><div><small>Reste à prélever ce mois</small><b>{money0(due)}</b></div>{incoming > 0 && <div><small>Rentrées attendues</small><b className="ok">+{money0(incoming)}</b></div>}</div>
    <div className="list">{items.slice(0, compact ? 5 : 20).map((r) => {
      const d = new Date(r.next + "T12:00:00"), days = Math.round((d - new Date(todayISO() + "T12:00:00")) / 864e5);
      return <div className="item" key={r.label + r.amount + r.next}>
        <span className="dateChip"><b>{d.getDate()}</b><small>{d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</small></span>
        <div className="itemMain"><b>{r.label}</b><small>{r.planned ? "Automatique" : r.category} · {days <= 0 ? "aujourd’hui" : days === 1 ? "demain" : `dans ${days} jours`}</small></div>
        <div className="itemSide"><b className={r.amount > 0 ? "ok" : ""}>{r.amount > 0 ? "+" : "−"}{money(Math.abs(r.amount))}</b></div>
      </div>;
    })}</div>
    {items.some((r) => !r.planned) && <p className="finePrint" style={{ margin: "8px 0 4px", justifyContent: "flex-start" }}><Icon name="info" size={13} />Les lignes non automatiques sont estimées d’après vos 3 derniers mois.</p>}
  </>;
}

export default function Overview({ m, data, limits, go, openPlans, list, open, goOps, dayCurve, liveInfo, showChart, fetchHistory, eurPerUsd }) {
  const accounts = [...data.accounts].sort((a, b) => b.balance - a.balance);
  const series = useMemo(() => {
    const s = monthlySeries(data.transactions, 6), first = s.findIndex((x) => x.count > 0);
    return first < 0 ? [] : s.slice(Math.min(first, s.length - 3));
  }, [data.transactions]);
  return <>
    <NetWorth m={m} data={data} limits={limits} openPlans={openPlans} dayCurve={dayCurve} liveInfo={liveInfo} showChart={showChart} fetchHistory={fetchHistory} eurPerUsd={eurPerUsd} />
    <GettingStarted data={data} open={open} go={go} />
    <Kpis m={m} />
    <div className="grid g3">
      <Panel title="Comptes" action={accounts.length ? "Tout voir" : null} onAction={() => go("accounts")} className="span2 fadeIn">
        {accounts.length ? <div className="list">{accounts.slice(0, 5).map((a) => <button className="item hover tap" key={a.id} onClick={() => open("accountView", { id: a.id })}>
          <InstIcon name={a.institution || a.name} />
          <div className="itemMain"><b>{a.name}</b><small>{a.institution ? a.institution + " · " : ""}{KIND_LABEL[a.kind]}</small></div>
          <div className="itemSide"><b>{money(a.balance, a.currency)}</b><small className="faint">{a.powens_account_id ? "Synchro " : "Mis à jour "}{ago(a.updated_at)}</small></div>
        </button>)}</div> : <Empty icon="bank" title="Aucun compte pour l’instant" text="Ajoutez vos comptes à la main, ou connectez votre banque."><button className="btn primary sm" onClick={() => open("account")}><Icon name="plus" size={15} />Ajouter un compte</button></Empty>}
      </Panel>
      <Panel title="Analyse du mois" icon="sparkles" className="fadeIn">
        <Locked on={!limits.insights} title="Analyse automatique" text="Repérez les dépenses qui dérapent avant la fin du mois." onUnlock={() => openPlans("plus")}>
          <InsightList list={list} />
        </Locked>
      </Panel>
    </div>
    <div className="grid g3">
      <Panel title="Revenus et dépenses" icon="trending" className="span2 fadeIn flowPanel">
        {series.length ? <><FlowBars series={series} format={money0} label={monthLabel} /><FlowStats series={series} /></> : <Empty icon="trending" title="Pas encore d’historique" text="Vos revenus et dépenses mois par mois s’afficheront ici." />}
      </Panel>
      <Panel title="Dépenses par catégorie" icon="pie" className="fadeIn">
        <CategoryPanel m={m} goOps={goOps} />
      </Panel>
    </div>
    <div className="grid g3">
      <Panel title="Budgets" action="Gérer" onAction={() => go("budget")} className="fadeIn">
        {m.budgets.length ? m.budgets.slice(0, 4).map((b) => <BudgetRow key={b.category} b={b} onClick={() => open("budget", { budget: b })} />) : <Empty icon="target" title="Pas encore de budget" text="Fixez un plafond par catégorie : on vous prévient si le rythme s’emballe."><button className="btn primary sm" onClick={() => open("budget")}><Icon name="plus" size={15} />Créer un budget</button></Empty>}
      </Panel>
      <Panel title="À venir" icon="repeat" className="fadeIn">
        <Locked on={!limits.insights} title="Prélèvements à venir" text="Loyer, abonnements, salaire : détectés automatiquement." onUnlock={() => openPlans("plus")}>
          <Upcoming data={data} compact />
        </Locked>
      </Panel>
      <Panel title="Dernières opérations" action={data.transactions.length ? "Historique" : null} onAction={() => go("ops")} className="fadeIn">
        {data.transactions.length ? <div className="list">{data.transactions.slice(0, 6).map((t) => <TxRow key={t.id} t={t} onClick={() => open("tx", { tx: t })} />)}</div> : <Empty icon="list" title="Aucune opération" text="Elles arrivent depuis votre banque, ou ajoutez-les à la main."><button className="btn primary sm" onClick={() => open("tx")}><Icon name="plus" size={15} />Ajouter</button></Empty>}
      </Panel>
    </div>
    <Panel title="Projection du patrimoine" icon="layers" className="fadeIn">
      <Locked on={!limits.projection} plan="Pro" title="Projection jusqu’à 30 ans" text="Voyez où vous mène votre rythme d’épargne actuel." onUnlock={() => openPlans("pro")}>
        <WealthProjection m={m} data={data} fetchHistory={fetchHistory} />
      </Locked>
    </Panel>
  </>;
}
