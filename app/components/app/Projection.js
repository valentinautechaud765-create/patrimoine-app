"use client";
// Projections (style Revolut) : valeur projetée, apports cumulés et fourchette, avec le détail du calcul.
import { useMemo, useRef, useState } from "react";
import Icon from "../Icon.js";
import { money, money0 } from "../../../lib/format.js";
import { perMonth } from "../../../lib/model.js";
import { TickerIcon, Empty } from "./ui.js";

const fmtK = (v) => Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " M€" : Math.abs(v) >= 1e4 ? Math.round(v / 1e3) + "k €" : Math.abs(v) >= 1e3 ? (v / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + "k €" : Math.round(v) + " €";

// Simulation mois par mois : capital × (1 + r/12) + apport. La fourchette = rendement ± écart.
export function simulate({ start, monthly, rate, years, spread = 2 }) {
  const n = years * 12, run = (r) => { const i = r / 100 / 12, out = [start]; let v = start; for (let k = 1; k <= n; k++) { v = v * (1 + i) + monthly; out.push(v); } return out; };
  const mid = run(rate), low = run(Math.max(-5, rate - spread)), high = run(rate + spread);
  const contrib = Array.from({ length: n + 1 }, (_, k) => start + monthly * k);
  return { mid, low, high, contrib, n };
}

export function ProjectionChart({ sim, years, startYear = new Date().getFullYear() }) {
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const { mid, low, high, contrib, n } = sim;
  const max = Math.max(...high, ...contrib, 1), min = Math.min(0, ...low, ...contrib);
  const X = (k) => (k / n) * 1000, Y = (v) => 240 - ((v - min) / (max - min || 1)) * 220;
  const path = (arr) => arr.map((v, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const band = path(high) + " " + [...low].reverse().map((v, k) => `L${X(n - k).toFixed(1)},${Y(v).toFixed(1)}`).join(" ") + " Z";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * years));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * (max - min));
  const k = hover == null ? n : hover;
  const pick = (e) => { const r = box.current.getBoundingClientRect(); setHover(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * n)); };
  return <div className="projWrap">
    <div className="projLegend">
      <div><i style={{ background: "#2ee59d" }} /><small>Valeur projetée{hover != null ? ` · ${startYear + Math.floor(k / 12)}` : ""}</small><b className="money">{money0(mid[k])}</b></div>
      <div><i style={{ background: "#7fa8ff" }} /><small>Vos apports</small><b className="money">{money0(contrib[k])}</b></div>
      <div><i style={{ background: "rgba(46,229,157,.35)" }} /><small>Fourchette</small><b className="money">{fmtK(low[k])} – {fmtK(high[k])}</b></div>
    </div>
    <div className="projChart" ref={box} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)}>
      <svg viewBox="0 0 1000 250" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="projBand" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2ee59d" stopOpacity=".22" /><stop offset="1" stopColor="#2ee59d" stopOpacity=".05" /></linearGradient></defs>
        {yTicks.map((v, i) => <line key={i} x1="0" x2="1000" y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,.05)" vectorEffect="non-scaling-stroke" />)}
        <path d={band} fill="url(#projBand)" />
        <path d={path(contrib)} fill="none" stroke="#7fa8ff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path(mid)} fill="none" stroke="#2ee59d" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={X(k)} x2={X(k)} y1="10" y2="245" stroke="rgba(255,255,255,.25)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="projDot" style={{ left: X(k) / 10 + "%", top: (Y(mid[k]) / 250) * 100 + "%", "--c": "#2ee59d" }} />
      <span className="projDot" style={{ left: X(k) / 10 + "%", top: (Y(contrib[k]) / 250) * 100 + "%", "--c": "#7fa8ff" }} />
      <div className="projY">{yTicks.slice(1).map((v, i) => <span key={i} style={{ top: (Y(v) / 250) * 100 + "%" }}>{fmtK(v)}</span>)}</div>
    </div>
    <div className="projX">{ticks.map((t, i) => <span key={i}>{startYear + t}</span>)}</div>
  </div>;
}

function Slider({ label, value, display, min, max, step = 1, onChange }) {
  return <label className="projSlider"><span>{label}</span><b>{display}</b>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} style={{ "--p": ((value - min) / (max - min)) * 100 + "%" }} />
  </label>;
}

/* ---------- Projection du patrimoine (vue d'ensemble) ---------- */
export function WealthProjection({ m, data }) {
  // Effort d'épargne estimé = opérations automatiques (par mois) + moyenne des autres opérations des 3 derniers mois complets.
  // Les virements vers l'épargne (catégorie Épargne) restent dans le patrimoine : ils ne sont pas comptés comme dépenses.
  const calc = useMemo(() => {
    const recs = (data.recurrences || []).filter((r) => r.active && r.category !== "Épargne");
    const recIn = recs.filter((r) => r.amount > 0).reduce((n, r) => n + perMonth(r), 0), recOut = -recs.filter((r) => r.amount < 0).reduce((n, r) => n + perMonth(r), 0);
    const now = new Date(), months = [1, 2, 3].map((k) => new Date(now.getFullYear(), now.getMonth() - k, 15).toISOString().slice(0, 7));
    const active = months.filter((mo) => data.transactions.some((t) => String(t.date).startsWith(mo)));
    const others = data.transactions.filter((t) => !t.recurrence_id && t.category !== "Épargne" && active.some((mo) => String(t.date).startsWith(mo)));
    const otherIn = active.length ? others.filter((t) => t.amount > 0).reduce((n, t) => n + Number(t.amount), 0) / active.length : 0;
    const otherOut = active.length ? -others.filter((t) => t.amount < 0).reduce((n, t) => n + Number(t.amount), 0) / active.length : 0;
    return { recIn, recOut, otherIn, otherOut, months: active.length, total: recIn - recOut + otherIn - otherOut };
  }, [data.transactions, data.recurrences]);
  const suggested = Math.max(0, Math.round(calc.total / 10) * 10);
  const [monthly, setMonthly] = useState(null), [years, setYears] = useState(10), [rate, setRate] = useState(3.5);
  const mth = monthly ?? suggested;
  const sim = useMemo(() => simulate({ start: m.total, monthly: mth, rate, years }), [m.total, mth, rate, years]);
  const gain = sim.mid[sim.n] - sim.contrib[sim.n];
  const rows = [
    ["repeat", "Revenus automatiques", calc.recIn, "ok", "salaire, APL… (opérations automatiques)"],
    ["repeat", "Dépenses automatiques", -calc.recOut, "", "loyer, abonnements…"],
    ["list", "Autres revenus (moyenne)", calc.otherIn, "ok", calc.months ? `moyenne de vos ${calc.months} dernier${calc.months > 1 ? "s" : ""} mois` : "pas encore d’historique"],
    ["list", "Autres dépenses (moyenne)", -calc.otherOut, "", calc.months ? `courses, sorties… sur ${calc.months} mois` : "pas encore d’historique"],
  ];
  return <div className="projGrid">
    <div>
      <div className="eyebrow">Valeur moyenne projetée d’ici {new Date().getFullYear() + years}</div>
      <ProjectionChart sim={sim} years={years} />
      <div className="projSliders">
        <Slider label="Épargne par mois" value={mth} display={money0(mth)} min={0} max={Math.max(2000, suggested * 2)} step={10} onChange={setMonthly} />
        <Slider label="Durée" value={years} display={`${years} an${years > 1 ? "s" : ""}`} min={1} max={30} onChange={setYears} />
        <Slider label="Rendement annuel" value={rate} display={`${rate.toLocaleString("fr-FR")} %`} min={0} max={10} step={0.5} onChange={setRate} />
      </div>
    </div>
    <div className="projExplain">
      <b className="projExplainTitle"><Icon name="info" size={15} />Comment c’est calculé</b>
      <div className="calcRow start"><span>Patrimoine aujourd’hui</span><b className="money">{money(m.total)}</b></div>
      {rows.map(([icon, label, v, tone, sub]) => <div className="calcRow" key={label}><span><Icon name={icon} size={14} />{label}<small>{sub}</small></span><b className={Math.round(v) ? tone : "muted"}>{Math.round(v) === 0 ? "" : v > 0 ? "+" : "−"}{money0(Math.abs(v))}</b></div>)}
      <div className="calcRow total"><span>Épargne estimée par mois</span><b className={calc.total >= 0 ? "ok" : "bad"}>{calc.total >= 0 ? "+" : "−"}{money0(Math.abs(calc.total))}</b></div>
      {monthly != null && monthly !== suggested && <button className="link" onClick={() => setMonthly(null)}>Revenir à l’estimation ({money0(suggested)})</button>}
      <p>Chaque mois, l’épargne s’ajoute au patrimoine, et l’ensemble rapporte {rate.toLocaleString("fr-FR")} % par an. La fourchette montre le résultat avec 2 points de rendement en moins ou en plus. Au bout de {years} an{years > 1 ? "s" : ""}, les intérêts représentent <b className="ok">{money0(Math.max(0, gain))}</b>.</p>
      <p className="faint">Estimation indicative, pas une promesse ni un conseil en investissement.</p>
    </div>
  </div>;
}

/* ---------- Simulation d'investissement (placements) ---------- */
const DEFAULT_RATE = { ETF: 7, Action: 7, Crypto: 10, Fonds: 5, Obligations: 3 };
export function InvestProjection({ holdings, total }) {
  const lines = holdings.filter((h) => Number(h.value) > 0).sort((a, b) => b.value - a.value);
  const [pick, setPick] = useState("all");
  const sel = pick === "all" ? null : lines.find((h) => h.id === pick);
  const baseRate = sel ? DEFAULT_RATE[sel.asset_class] ?? 6 : lines.length ? Math.round((lines.reduce((n, h) => n + (DEFAULT_RATE[h.asset_class] ?? 6) * h.value, 0) / (total || 1)) * 2) / 2 : 7;
  const [monthly, setMonthly] = useState(150), [years, setYears] = useState(20), [rateOverride, setRate] = useState(null);
  const rate = rateOverride ?? baseRate;
  const start = sel ? Number(sel.value) : total;
  const sim = useMemo(() => simulate({ start, monthly, rate, years, spread: sel?.asset_class === "Crypto" ? 6 : 3 }), [start, monthly, rate, years, sel]);
  if (!lines.length) return <Empty icon="trending" title="Ajoutez un placement" text="La simulation part de vos positions actuelles." />;
  return <div className="projGrid">
    <div>
      <div className="assetPick">
        <button className={pick === "all" ? "on" : ""} onClick={() => { setPick("all"); setRate(null); }}><span className="allIco"><Icon name="pie" size={16} /></span>Tout le portefeuille</button>
        {lines.map((h) => <button key={h.id} className={pick === h.id ? "on" : ""} onClick={() => { setPick(h.id); setRate(null); }}><TickerIcon holding={h} />{h.ticker || h.name}</button>)}
      </div>
      <div className="eyebrow">Valeur moyenne projetée d’ici {new Date().getFullYear() + years}{sel ? ` · ${sel.name}` : ""}</div>
      <ProjectionChart sim={sim} years={years} />
      <div className="projSliders">
        <Slider label="Apport mensuel" value={monthly} display={money0(monthly)} min={0} max={2000} step={10} onChange={setMonthly} />
        <Slider label="Durée" value={years} display={`${years} ans`} min={1} max={40} onChange={setYears} />
        <Slider label="Rendement annuel" value={rate} display={`${rate.toLocaleString("fr-FR")} %`} min={0} max={sel?.asset_class === "Crypto" ? 30 : 15} step={0.5} onChange={setRate} />
      </div>
    </div>
    <div className="projExplain">
      <b className="projExplainTitle"><Icon name="info" size={15} />Comment c’est calculé</b>
      <div className="calcRow start"><span>Valeur actuelle{sel ? ` (${sel.ticker || sel.name})` : " du portefeuille"}</span><b className="money">{money(start)}</b></div>
      <div className="calcRow"><span><Icon name="plus" size={14} />Apport chaque mois<small>achat programmé de {money0(monthly)}</small></span><b>+{money0(monthly)}</b></div>
      <div className="calcRow"><span><Icon name="trending" size={14} />Rendement supposé<small>{rateOverride == null ? (sel ? `moyenne historique indicative pour un placement « ${sel.asset_class} »` : "moyenne pondérée de vos placements") : "choisi par vous"}</small></span><b>{rate.toLocaleString("fr-FR")} % / an</b></div>
      <div className="calcRow total"><span>Total versé en {years} ans</span><b className="money">{money0(sim.contrib[sim.n])}</b></div>
      <div className="calcRow total"><span>Gains estimés</span><b className="ok">+{money0(Math.max(0, sim.mid[sim.n] - sim.contrib[sim.n]))}</b></div>
      <p>Les gains sont réinvestis chaque mois (intérêts composés). La fourchette montre le résultat avec {sel?.asset_class === "Crypto" ? 6 : 3} points de rendement en moins ou en plus : les marchés ne montent pas en ligne droite.</p>
      <p className="faint">Les performances passées ne préjugent pas des performances futures. Simulation indicative, pas un conseil en investissement.</p>
    </div>
  </div>;
}
