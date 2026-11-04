"use client";
// Petites briques visuelles partagées par tous les écrans de l'appli.
import Icon from "../Icon.js";
import { cat, ASSET_COLORS } from "../../../lib/categories.js";
import { splitMoney } from "../../../lib/format.js";

const INST_COLORS = ["#4f7dff", "#2fbf8f", "#e0679a", "#f0a13a", "#8f6bff", "#2fb3d1", "#e8664a", "#6d8299"];
export const instColor = (name = "") => INST_COLORS[[...String(name)].reduce((n, c) => n + c.charCodeAt(0), 0) % INST_COLORS.length];

export function InstIcon({ name, size = 40 }) {
  const c = instColor(name);
  return <span className="instIco" style={{ width: size, height: size, flexBasis: size, background: `linear-gradient(140deg, ${c}, color-mix(in srgb, ${c} 55%, #000))` }}>{String(name || "?").trim().charAt(0).toUpperCase()}</span>;
}

// Avatar : monogramme sur verre sombre, entouré d'un anneau dégradé.
export function Avatar({ name = "", size = 34, src = "" }) {
  const w = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  const ini = ((w[0]?.[0] || "?") + (w[1]?.[0] || "")).toUpperCase();
  return <span className="avatar ring" style={{ width: size, height: size, fontSize: Math.round(size * (ini.length > 1 ? 0.36 : 0.42)) }}>
    {src ? <img src={src} alt="" className="avatarImg" /> : <span>{ini}</span>}
  </span>;
}

// Photo choisie → carré recadré au centre, 320 px, JPEG léger (prêt à envoyer)
export function squarePhoto(file, size = 320) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choisissez une image."));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
    img.src = url;
  });
}

export function CatIcon({ category, size = 40, color }) {
  const c = cat(category);
  return <span className="catIco" style={{ "--c": color || c.color, width: size, height: size, flexBasis: size }}><Icon name={c.icon} size={Math.round(size * 0.45)} /></span>;
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
