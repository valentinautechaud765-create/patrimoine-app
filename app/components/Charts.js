"use client";
import { useId, useMemo, useRef, useState } from "react";

// Courbe principale : l'en-tête (render prop) reçoit le point survolé.
export function AreaChart({ points, height = 200, children, color: forced, fade, scaleLabels = false, markers = [], onMarkerClick, onMarkerDismiss, markerPopover, selectedMarkerId }) {
  const [hover, setHover] = useState(null);
  const gid = "ag" + useId().replace(/:/g, "");
  const box = useRef(null), raf = useRef(0), timer = useRef(0);
  const geo = useMemo(() => {
    const step = Math.max(1, Math.ceil(points.length / 600));
    const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    // Un seul point (nouveau compte) : ligne plate plutôt qu'un triangle
    if (pts.length === 1) pts.unshift(pts[0]);
    const vals = pts.map((p) => p.value);
    if (!vals.length) return { pts, xy: [], line: "", fill: "" };
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.14 || Math.max(1, hi * 0.01);
    const plotLeft = 0;
    const plotWidth = 1000 - plotLeft;
    const yFor = (v) => 100 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 100;
    const xy = vals.map((v, i) => [pts.length === 1 ? plotLeft + plotWidth / 2 : plotLeft + (i / (pts.length - 1)) * plotWidth, yFor(v)]);
    const scaleTicks = scaleLabels ? Array.from({ length: 5 }, (_, i) => {
      const value = hi + pad - (i / 4) * (hi - lo + 2 * pad);
      return { value, y: yFor(value) };
    }) : [];
    const zeroY = scaleLabels && lo <= 0 && hi >= 0 ? yFor(0) : null;
    // Courbe cubique monotone : arrondit les changements de direction sans créer de
    // dépassement au-dessus / en dessous des points réellement mesurés.
    const slopes = xy.slice(0, -1).map((point, i) => point[0] === xy[i + 1][0] ? 0 : (xy[i + 1][1] - point[1]) / (xy[i + 1][0] - point[0]));
    const tangents = xy.map((_, i) => {
      if (i === 0) return slopes[0] || 0;
      if (i === xy.length - 1) return slopes[slopes.length - 1] || 0;
      const prev = slopes[i - 1], next = slopes[i];
      if (!prev || !next || Math.sign(prev) !== Math.sign(next)) return 0;
      return 2 * prev * next / (prev + next);
    });
    const d = xy.map(([x, y], i) => {
      if (!i) return `M${x.toFixed(1)},${y.toFixed(2)}`;
      const [px, py] = xy[i - 1], dx = x - px;
      const c1y = py + tangents[i - 1] * dx / 3;
      const c2y = y - tangents[i] * dx / 3;
      return `C${(px + dx / 3).toFixed(1)},${c1y.toFixed(2)} ${(x - dx / 3).toFixed(1)},${c2y.toFixed(2)} ${x.toFixed(1)},${y.toFixed(2)}`;
    }).join(" ");
    return { pts, xy, tangents, line: d, fill: d + " L" + (plotLeft + plotWidth) + ",104 L" + plotLeft + ",104 Z", scaleTicks, zeroY, plotLeft };
  }, [points]);
  const up = geo.pts.length < 2 || geo.pts[geo.pts.length - 1].value >= geo.pts[0].value;
  const color = forced || (up ? "#3d7cff" : "#ff6b7a");
  const pick = (e) => {
    const r = box.current.getBoundingClientRect(), x = e.clientX;
    clearTimeout(timer.current); cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setHover(Math.max(0, Math.min(1, (x - r.left) / r.width))));
  };
  const position = hover == null ? geo.pts.length - 1 : hover * (geo.pts.length - 1);
  const i = Math.min(geo.pts.length - 1, Math.floor(position));
  const j = Math.min(geo.pts.length - 1, i + 1);
  const t = position - i;
  const a = geo.pts[i], b = geo.pts[j];
  const interpolateDate = () => {
    const ta = Date.parse(a?.date), tb = Date.parse(b?.date);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return new Date(ta + (tb - ta) * t).toISOString();
    return t < 0.5 ? a?.date : b?.date;
  };
  const activePoint = a ? { ...a, ...Object.fromEntries(Object.keys(a).filter((key) => typeof a[key] === "number" && typeof b?.[key] === "number").map((key) => [key, Number(a[key]) + (Number(b[key]) - Number(a[key])) * t])), value: Number(a.value) + (Number(b?.value ?? a.value) - Number(a.value)) * t, date: interpolateDate() } : null;
  const pa = geo.xy[i], pb = geo.xy[j];
  const p = pa && pb ? (() => {
    const dx = pb[0] - pa[0], u = t, m0 = geo.tangents?.[i] || 0, m1 = geo.tangents?.[j] || 0;
    const c1 = pa[1] + m0 * dx / 3, c2 = pb[1] - m1 * dx / 3, v = 1 - u;
    return [pa[0] + dx * u, v * v * v * pa[1] + 3 * v * v * u * c1 + 3 * v * u * u * c2 + u * u * u * pb[1]];
  })() : pa;
  return <>
    {children && children(activePoint || geo.pts[i], geo.pts[0], hover != null)}
    <div className={"area" + (fade ? " fade" : "")} ref={box} style={{ height }} onPointerDown={(e) => { if (!e.target.closest(".areaMarker, .markerPopover")) onMarkerDismiss?.(); pick(e); }} onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && pick(e)} onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)} onPointerUp={(e) => { if (e.pointerType !== "mouse") timer.current = setTimeout(() => setHover(null), 2200); }}>
      <svg viewBox="0 0 1000 104" preserveAspectRatio="none" role="img" aria-label="Évolution">
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={fade ? ".2" : ".32"} /><stop offset=".75" stopColor={color} stopOpacity={fade ? ".02" : ".04"} /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        
        {scaleLabels && geo.scaleTicks?.map((t, n) => <g key={n}>
          <line x1={geo.plotLeft} x2="1000" y1={t.y} y2={t.y} stroke="rgba(255,255,255,.11)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </g>)}
        {scaleLabels && geo.zeroY != null && <line x1={geo.plotLeft} x2="1000" y1={geo.zeroY} y2={geo.zeroY} stroke="rgba(255,255,255,.42)" strokeWidth="1.5" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />}
        <path d={geo.fill} fill={`url(#${gid})`} />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="7" opacity=".16" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
      {markers.map((marker, mi) => {
        if (geo.pts.length < 2) return null;
        const target = Date.parse(marker.date);
        if (!Number.isFinite(target)) return null;
        let nearest = 0, distance = Infinity;
        geo.pts.forEach((point, index) => {
          const stamp = Date.parse(point.date);
          if (!Number.isFinite(stamp)) return;
          const delta = Math.abs(stamp - target);
          if (delta < distance) { distance = delta; nearest = index; }
        });
        const sameDay = markers.slice(0, mi).filter((m) => String(m.date).slice(0, 10) === String(marker.date).slice(0, 10)).length;
        const markerColor = marker.type === "Achat" ? "#2ee59d" : marker.type === "Vente" ? "#ff6b7a" : "#ffb454";
        const selected = marker.id === selectedMarkerId;
        const activeColor = marker.type === "Achat" ? "#42ffad" : marker.type === "Vente" ? "#ff3158" : "#ffd078";
        return <button type="button" className="areaMarker" key={marker.id || mi} title={marker.title} aria-label={marker.title} aria-pressed={selected} onClick={(e) => { e.stopPropagation(); const r = box.current.getBoundingClientRect(), b = e.currentTarget.getBoundingClientRect(); onMarkerClick?.(marker, { x: ((b.left + b.width / 2 - r.left) / r.width) * 100, y: ((b.top + b.height / 2 - r.top) / r.height) * 100 }); }}
          style={{ position: "absolute", zIndex: selected ? 10 : 8, cursor: "pointer", padding: 0, display: "grid", placeItems: "center", left: (nearest / (geo.pts.length - 1) * 100) + "%", top: (geo.xy[nearest][1] / 104 * 100 + (sameDay % 3) * 2) + "%", transform: "translate(-50%, -50%)", width: 32, height: 32, border: 0, borderRadius: "50%", background: "transparent", pointerEvents: "auto", touchAction: "manipulation" }}>
          <span style={{ display: "block", width: 10, height: 10, borderRadius: "50%", background: selected ? activeColor : markerColor, border: "2px solid #101827", boxShadow: selected ? "0 0 0 2px " + activeColor + "55, 0 0 9px 2px " + activeColor : "0 0 0 1px " + markerColor, transition: "all .16s ease" }} />
        </button>;
      })}
      {markerPopover && <div className="markerPopover" style={{ left: `clamp(8px, ${markerPopover.x}%, calc(100% - 336px))`, right: "auto", top: `clamp(8px, ${markerPopover.y}%, calc(100% - 228px))` }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>{markerPopover.content}</div>}
      {p && (hover != null || !fade) && <span className={"areaDot" + (hover == null ? " live" : "")} style={{ left: p[0] / 10 + "%", top: (p[1] / 104) * 100 + "%", "--c": color }} /> }
      {hover != null && p && <span className="areaRule" style={{ left: p[0] / 10 + "%" }} />}
    </div>
  </>;
}

// Petite courbe décorative (tuiles, listes)
export function Sparkline({ values, width = 90, height = 28, color }) {
  if (!values || values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`).join(" ");
  const c = color || (values[values.length - 1] >= values[0] ? "#2ee59d" : "#ff6b7a");
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={d} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// Anneau de répartition
export function Donut({ parts, size = 168, thickness = 16, center }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1, r = (size - thickness) / 2, C = 2 * Math.PI * r;
  let acc = 0;
  return <div className="donut" style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={thickness} />
      {parts.map((p) => { const len = (p.value / total) * C, gap = parts.length > 1 ? 3 : 0, el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={thickness} strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-acc} strokeLinecap="butt" />; acc += len; return el; })}
    </svg>
    {center && <div className="donutCenter">{center}</div>}
  </div>;
}

// Anneau de progression (budgets)
export function Ring({ value, size = 44, thickness = 4, color = "#3d7cff" }) {
  const r = (size - thickness) / 2, C = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={thickness} />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeDasharray={`${v * C} ${C}`} strokeLinecap="round" />
  </svg>;
}

// Barres groupées revenus / dépenses par mois, avec info-bulle au survol ou au toucher
export function FlowBars({ series, height = 180, format = (v) => v, label = (m) => m }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.spent]));
  const sel = hover == null ? series.length - 1 : hover, cur = series[sel];
  return <div className="flow">
    <div className="flowTip">
      <span className="flowMonth">{label(cur.month)}</span>
      <span><i className="dot" style={{ background: "var(--blue)" }} />Revenus <b>{format(cur.income)}</b></span>
      <span><i className="dot" style={{ background: "rgba(255,255,255,.35)" }} />Dépenses <b>{format(cur.spent)}</b></span>
      <span className={cur.net >= 0 ? "ok" : "bad"}>Solde <b>{cur.net >= 0 ? "+" : "−"}{format(Math.abs(cur.net))}</b></span>
    </div>
    <div className="flowBars" style={{ minHeight: height }} onMouseLeave={() => setHover(null)}>
      {series.map((s, i) => <button key={s.month} className={"flowCol" + (i === sel ? " on" : "")} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} aria-label={label(s.month)}>
        <span className="flowPair">
          <i className="in" style={{ height: (s.income / max) * 100 + "%" }} />
          <i className="out" style={{ height: (s.spent / max) * 100 + "%" }} />
        </span>
        <small>{label(s.month).slice(0, 3)}</small>
      </button>)}
    </div>
  </div>;
}
