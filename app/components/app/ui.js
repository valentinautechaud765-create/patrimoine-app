"use client";
// Petites briques visuelles partagées par tous les écrans de l'appli.
import Icon from "../Icon.js";
import { cat, ASSET_COLORS } from "../../../lib/categories.js";
import { splitMoney } from "../../../lib/format.js";

const INST_COLORS = ["#4f7dff", "#2fbf8f", "#e0679a", "#f0a13a", "#8f6bff", "#2fb3d1", "#e8664a", "#6d8299"];
export const instColor = (name = "") => (brandOf(name)?.bg) || INST_COLORS[[...String(name)].reduce((n, c) => n + c.charCodeAt(0), 0) % INST_COLORS.length];

// Banques connues : couleur de la marque et monogramme (pas leurs logos officiels).
const BRANDS = [
  [/revolut/i, { bg: "#0b0c10", fg: "#fff", m: "R" }],
  [/bourso/i, { bg: "#d4007a", fg: "#fff", m: "B" }],
  [/cr[ée]dit agricole/i, { bg: "#00775a", fg: "#fff", m: "CA" }],
  [/cr[ée]dit mutuel/i, { bg: "#0a3d8f", fg: "#fff", m: "CM" }],
  [/\bcic\b/i, { bg: "#0b5fae", fg: "#fff", m: "CIC" }],
  [/bnp|hello ?bank/i, { bg: "#00915a", fg: "#fff", m: "BNP" }],
  [/soci[ée]t[ée] g[ée]n[ée]rale|\bsg\b/i, { bg: "#e60028", fg: "#fff", m: "SG" }],
  [/\blcl\b/i, { bg: "#0d2b6f", fg: "#ffd200", m: "LCL" }],
  [/caisse d.?[ée]pargne/i, { bg: "#d6001c", fg: "#fff", m: "CE" }],
  [/banque populaire/i, { bg: "#0060ae", fg: "#fff", m: "BP" }],
  [/banque postale/i, { bg: "#003da5", fg: "#ffcc00", m: "LBP" }],
  [/fortuneo/i, { bg: "#64b42d", fg: "#fff", m: "F" }],
  [/\bn26\b/i, { bg: "#36a18b", fg: "#fff", m: "N26" }],
  [/trade republic/i, { bg: "#111", fg: "#fff", m: "TR" }],
  [/qonto/i, { bg: "#1d1d1b", fg: "#fff", m: "Q" }],
  [/shine/i, { bg: "#1f8f7a", fg: "#fff", m: "S" }],
  [/lydia|sumeria/i, { bg: "#2b6bff", fg: "#fff", m: "L" }],
  [/paypal/i, { bg: "#003087", fg: "#fff", m: "P" }],
  [/degiro/i, { bg: "#00a3e0", fg: "#fff", m: "D" }],
  [/binance/i, { bg: "#1e2026", fg: "#f0b90b", m: "B" }],
  [/coinbase/i, { bg: "#0052ff", fg: "#fff", m: "C" }],
  [/ing\b/i, { bg: "#ff6200", fg: "#fff", m: "ING" }],
  [/hsbc/i, { bg: "#db0011", fg: "#fff", m: "H" }],
];
function brandOf(name = "") { const b = BRANDS.find(([re]) => re.test(String(name))); return b ? b[1] : null; }
const monogram = (name = "") => {
  const w = String(name).replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || "?") + (w.length > 1 && w[1].length > 2 ? w[1][0] : "")).toUpperCase();
};
const KIND_GLYPH = { courant: "card", epargne: "piggy", investissement: "trending" };

// Logo de banque : tuile aux couleurs de la banque, reflet discret, et badge du type de compte.
export function InstIcon({ name, size = 40, kind, manual }) {
  const b = brandOf(name), c = b?.bg || instColor(name);
  const m = b?.m || monogram(name), long = m.length > 2;
  const style = { width: size, height: size, flexBasis: size, "--c": c, "--fg": b?.fg || "#fff", fontSize: Math.round(size * (long ? 0.27 : m.length > 1 ? 0.34 : 0.42)) };
  return <span className={"instIco" + (b ? " brand" : "")} style={style}>
    {manual ? <Icon name="edit" size={Math.round(size * 0.42)} /> : <span className="instMono">{m}</span>}
    {kind && KIND_GLYPH[kind] && <i className={"instKind k-" + kind}><Icon name={KIND_GLYPH[kind]} size={Math.max(9, Math.round(size * 0.24))} stroke={2.2} /></i>}
  </span>;
}

// Avatar : monogramme sur verre sombre, entouré d'un anneau dégradé.
export function Avatar({ name = "", size = 34 }) {
  const w = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  const ini = ((w[0]?.[0] || "?") + (w[1]?.[0] || "")).toUpperCase();
  return <span className="avatar ring" style={{ width: size, height: size, fontSize: Math.round(size * (ini.length > 1 ? 0.36 : 0.42)) }}><span>{ini}</span></span>;
}

export function CatIcon({ category, size = 40 }) {
  const c = cat(category);
  return <span className="catIco" style={{ "--c": c.color, width: size, height: size, flexBasis: size }}><Icon name={c.icon} size={Math.round(size * 0.45)} /></span>;
}

export function TickerIcon({ holding }) {
  const c = ASSET_COLORS[holding.asset_class] || "#7fa8ff";
  return <span className="tickerIco" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>{String(holding.ticker || holding.name || "?").slice(0, 4).toUpperCase()}</span>;
}

// Grand montant avec centimes plus discrets
export function Amount({ value, className = "" }) {
  const [a, b] = splitMoney(value);
  return <span className={"money " + className}>{a}<small>{b}</small></span>;
}

export function Panel({ title, action, onAction, children, className = "", icon }) {
  return (
    <section className={"card panel " + className}>
      {(title || action) && <div className="panelHead">
        <h3>{icon && <Icon name={icon} size={16} />}{title}</h3>
        {action && <button className="link" onClick={onAction}>{action}<Icon name="chevronRight" size={14} /></button>}
      </div>}
      {children}
    </section>
  );
}

export function Empty({ icon, title, text, children }) {
  return (
    <div className="empty">
      <span className="emptyIco"><Icon name={icon} size={22} /></span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

// Voile posé sur une fonction réservée aux formules payantes
export function Locked({ on, title, text, plan = "Plus", onUnlock, children, className = "" }) {
  if (!on) return children;
  return (
    <div className={"locked " + className}>
      <div aria-hidden="true" className="lockedContent">{children}</div>
      <div className="lockedVeil"><div>
        <span className="lockIco"><Icon name="lock" size={20} /></span>
        <b>{title}</b>
        <span className="muted" style={{ fontSize: 13.5 }}>{text}</span>
        <button className="btn primary sm" onClick={onUnlock}><Icon name="sparkles" size={15} />Débloquer avec {plan}</button>
      </div></div>
    </div>
  );
}

export const ago = (iso) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60e3));
  if (m < 1) return "à l’instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
};

export const KIND_LABEL = { courant: "Compte courant", epargne: "Épargne", investissement: "Placements" };
