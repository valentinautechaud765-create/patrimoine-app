"use client";
import { useMemo, useState } from "react";
import Icon from "../Icon.js";
import { AreaChart } from "../Charts.js";
import { money, money0, signed, pct, todayISO, dayLabel } from "../../../lib/format.js";
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

function NetWorth({ m, data, limits, openPlans }) {
  const [period, setPeriod] = useState(1);
  const days = PERIODS[period][1];
  const points = useMemo(() => historyPoints(data.snapshots, m.total, days), [data.snapshots, m.total, days]);
  const parts = [
    { label: "Comptes courants", value: m.cash, color: "#7fa8ff" },
    { label: "Épargne", value: m.savings, color: "#2ee59d" },
    { label: "Placements", value: m.invest, color: "#3d7cff" },
  ].filter((p) => p.value > 0);
  const sumParts = parts.reduce((n, p) => n + p.value, 0) || 1;
  return (
    <section className="card netWorth fadeIn">
      <AreaChart points={points} height={190}>
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
                  <span className="nwWhen">{hovering ? dayLabel(pt.date) : PERIODS[period][0] === "Tout" ? "depuis le début" : `sur ${({ "1S": "7 jours", "1M": "1 mois", "3M": "3 mois", "1A": "1 an" })[PERIODS[period][0]]}`}</span>
                </> : <span className="nwWhen">La courbe se construit jour après jour.</span>}
              </div>
            </div>
            <div className="seg" role="tablist" aria-label="Période">
              {PERIODS.map(([label, d], i) => {
                const lock = d > limits.historyDays;
                return <button key={label} className={i === period ? "on" : ""} onClick={() => lock ? openPlans("plus") : setPeriod(i)}>{label}{lock && <Icon name="lock" size={11} style={{ marginLeft: 4, opacity: 0.6 }} />}</button>;
              })}
            </div>
          </div>;
        }}
      </AreaChart>
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

export function TxRow({ t, onClick }) {
  return <div className="item">
    <CatIcon category={t.category} />
    <div className="itemMain"><b>{t.label}</b><small>{t.category}</small></div>
    <div className="itemSide"><b className={t.amount > 0 ? "ok" : ""}>{t.amount > 0 ? "+" : "−"}{money(Math.abs(t.amount)).replace("-", "")}</b></div>
  </div>;
}

export function BudgetRow({ b }) {
  const over = b.spent > b.monthly_limit, fast = !over && b.pace > b.expected + 0.12;
  const color = over ? "var(--bad)" : fast ? "var(--warn)" : cat(b.category).color;
  return <div className="budgetRow">
    <CatIcon category={b.category} />
    <div style={{ minWidth: 0 }}>
      <div className="budgetLine"><b>{b.category}</b><span className="num"><span style={{ color: over ? "var(--bad)" : "var(--fg)" }}>{money0(b.spent)}</span><span className="muted"> / {money0(b.monthly_limit)}</span></span></div>
      <div className="bar"><i style={{ width: Math.min(100, b.pace * 100) + "%", background: color }} /><span className="pace" style={{ left: `calc(${Math.min(100, b.expected * 100)}% - 1px)` }} title="Rythme attendu à cette date" /></div>
      <small className="budgetNote">{over ? <span className="bad">Dépassé de {money0(b.spent - b.monthly_limit)}</span> : fast ? <span style={{ color: "var(--warn)" }}>Rythme élevé · reste {money0(b.monthly_limit - b.spent)}</span> : <span className="muted">Reste {money0(b.monthly_limit - b.spent)}</span>}</small>
    </div>
  </div>;
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

export default function Overview({ m, data, limits, go, openPlans, list }) {
  const accounts = [...data.accounts].sort((a, b) => b.balance - a.balance);
  return <>
    <NetWorth m={m} data={data} limits={limits} openPlans={openPlans} />
    <Kpis m={m} />
    <div className="grid g3">
      <Panel title="Comptes" action="Tout voir" onAction={() => go("accounts")} className="span2 fadeIn">
        {accounts.length ? <div className="list">{accounts.slice(0, 5).map((a) => <div className="item" key={a.id}>
          <InstIcon name={a.institution} />
          <div className="itemMain"><b>{a.name}</b><small>{a.institution} · {KIND_LABEL[a.kind]}</small></div>
          <div className="itemSide"><b>{money(a.balance, a.currency)}</b><small className="faint">{a.updated_at ? "Synchro " + ago(a.updated_at) : ""}</small></div>
        </div>)}</div> : <Empty icon="bank" title="Aucun compte pour l’instant" text="Connectez votre banque pour voir vos soldes se mettre à jour tout seuls."><button className="btn primary sm" onClick={() => go("accounts")}><Icon name="plus" size={15} />Connecter une banque</button></Empty>}
      </Panel>
      <Panel title="Analyse du mois" icon="sparkles" className="fadeIn">
        <Locked on={!limits.insights} title="Analyse automatique" text="Repérez les dépenses qui dérapent avant la fin du mois." onUnlock={() => openPlans("plus")}>
          <InsightList list={list} />
        </Locked>
      </Panel>
    </div>
    <div className="grid g2">
      <Panel title="Budgets" action="Gérer" onAction={() => go("budget")} className="fadeIn">
        {m.budgets.length ? m.budgets.slice(0, 4).map((b) => <BudgetRow key={b.category} b={b} />) : <Empty icon="target" title="Pas encore de budget" text="Fixez un plafond par catégorie : on vous prévient si le rythme s’emballe." />}
      </Panel>
      <Panel title="Dernières opérations" action="Historique" onAction={() => go("ops")} className="fadeIn">
        {data.transactions.length ? <div className="list">{data.transactions.slice(0, 6).map((t) => <TxRow key={t.id} t={t} />)}</div> : <Empty icon="list" title="Aucune opération" text="Elles arrivent automatiquement depuis votre banque, ou ajoutez-les à la main." />}
      </Panel>
    </div>
    <Panel title="Projection du patrimoine" icon="trending" className="fadeIn">
      <Locked on={!limits.projection} plan="Pro" title="Projection jusqu’à 20 ans" text="Voyez où vous mène votre rythme d’épargne actuel." onUnlock={() => openPlans("pro")}>
        <Projection m={m} data={data} />
      </Locked>
    </Panel>
  </>;
}
