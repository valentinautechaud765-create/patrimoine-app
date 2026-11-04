"use client";
// Fenêtres d'ajout / modification / suppression : opérations, comptes, budgets, positions.
import { useEffect, useState } from "react";
import Icon from "../Icon.js";
import { money, todayISO } from "../../../lib/format.js";
import { EXPENSE_CATEGORIES, ASSET_COLORS, cat } from "../../../lib/categories.js";
import { InstIcon, KIND_LABEL, ago } from "./ui.js";
import { TxRow } from "./Overview.js";

const num = (v) => Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
const str = (n) => (n === undefined || n === null || n === "" ? "" : String(n).replace(".", ","));

export function Modal({ onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true"><span className="grabber" aria-hidden="true" />{children}</div>
  </div>;
}
export const Head = ({ title, sub, onClose }) => <div className="modalHead"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div><button type="button" className="iconBtn" onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} /></button></div>;

// Bouton de suppression en deux temps (évite les erreurs de doigt)
function DeleteButton({ onConfirm, label = "Supprimer" }) {
  const [armed, setArmed] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return <button type="button" className={"btn block dangerBtn" + (armed ? " armed" : "")} disabled={busy} onClick={async () => { if (!armed) return setArmed(true); setBusy(true); await onConfirm(); setBusy(false); }}>
    <Icon name="trash" size={16} />{busy ? "Suppression…" : armed ? "Confirmer la suppression" : label}
  </button>;
}

function CatGrid({ list, value, onChange }) {
  return <div className="catGrid">{list.map((c) => <button type="button" key={c} className={"catPick" + (value === c ? " on" : "")} style={{ "--c": cat(c).color }} onClick={() => onChange(c)}><Icon name={cat(c).icon} size={18} /><span>{c}</span></button>)}</div>;
}

/* ---------- Opération ---------- */
export function TxForm({ tx, accounts, defaultAccount, onClose, onSave, onDelete }) {
  const editing = Boolean(tx?.id);
  const [type, setType] = useState(tx && tx.amount > 0 ? "in" : "out");
  const [amount, setAmount] = useState(tx ? str(Math.abs(tx.amount)) : ""), [label, setLabel] = useState(tx?.label || "");
  const [category, setCategory] = useState(tx?.category || "Courses"), [date, setDate] = useState(tx?.date || todayISO());
  const [account, setAccount] = useState(tx?.account_id || defaultAccount || ""), [busy, setBusy] = useState(false);
  const cats = type === "out" ? EXPENSE_CATEGORIES : ["Salaire", "Remboursement", "Autre"];
  const value = num(amount), ok = value > 0 && label.trim();
  const manual = accounts.filter((a) => !a.powens_account_id || a.id === account);
  async function submit(e) {
    e.preventDefault(); if (!ok) return;
    setBusy(true);
    const done = await onSave({ ...(tx?.id ? { id: tx.id } : {}), date, label: label.trim(), amount: type === "out" ? -value : value, category, account_id: account || null });
    setBusy(false); if (done !== false) onClose();
  }
  return <Modal onClose={onClose}>
    <form onSubmit={submit} className="modalForm">
      <Head title={editing ? "Modifier l’opération" : "Nouvelle opération"} onClose={onClose} />
      <div className="seg billingSeg"><button type="button" className={type === "out" ? "on" : ""} onClick={() => { setType("out"); if (!EXPENSE_CATEGORIES.includes(category)) setCategory("Courses"); }}>Dépense</button><button type="button" className={type === "in" ? "on" : ""} onClick={() => { setType("in"); setCategory("Salaire"); }}>Revenu</button></div>
      <label className="amountField"><span className={type === "out" ? "" : "ok"}>{type === "out" ? "−" : "+"}</span><input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} autoFocus={!editing} aria-label="Montant" /><span>€</span></label>
      <label className="label">Libellé<input className="input" placeholder={type === "out" ? "Ex. Carrefour, Uber…" : "Ex. Salaire, remboursement…"} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} /></label>
      <div className="label">Catégorie<CatGrid list={cats} value={category} onChange={setCategory} /></div>
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="label">Compte<select className="input" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Aucun</option>{manual.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      </div>
      {account && !accounts.find((a) => a.id === account)?.powens_account_id && <p className="formHint"><Icon name="info" size={14} />Le solde de ce compte sera mis à jour automatiquement.</p>}
      <button className="btn primary lg block" disabled={busy || !ok}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter l’opération"}</button>
      {editing && <DeleteButton onConfirm={async () => { if (await onDelete(tx) !== false) onClose(); }} label="Supprimer l’opération" />}
    </form>
  </Modal>;
}

/* ---------- Compte ---------- */
const KINDS = [["courant", "Courant", "card"], ["epargne", "Épargne", "piggy"], ["investissement", "Placements", "trending"]];
export function AccountForm({ account, onClose, onSave, onDelete }) {
  const editing = Boolean(account?.id), synced = Boolean(account?.powens_account_id);
  const [name, setName] = useState(account?.name || ""), [institution, setInstitution] = useState(account?.institution || "");
  const [kind, setKind] = useState(account?.kind || "courant"), [balance, setBalance] = useState(account ? str(account.balance) : ""), [busy, setBusy] = useState(false);
  const value = num(balance), ok = name.trim() && balance !== "" && Number.isFinite(value);
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => {
      e.preventDefault(); if (!ok) return; setBusy(true);
      const done = await onSave({ ...(editing ? { id: account.id } : {}), name: name.trim(), institution: institution.trim() || null, kind, ...(synced ? {} : { balance: Math.round(value * 100) / 100 }), currency: "EUR" });
      setBusy(false); if (done !== false) onClose();
    }}>
      <Head title={editing ? "Modifier le compte" : "Ajouter un compte"} sub={editing ? null : "Saisi à la main. Vous pourrez aussi connecter votre banque."} onClose={onClose} />
      <div className="kindPick">{KINDS.map(([k, l, i]) => <button type="button" key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}><Icon name={i} size={19} /><span>{l}</span></button>)}</div>
      <label className="label">Nom du compte<input className="input" placeholder={kind === "epargne" ? "Ex. Livret A" : kind === "investissement" ? "Ex. PEA" : "Ex. Compte courant"} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus={!editing} /></label>
      <label className="label">Banque<input className="input" placeholder="Ex. Crédit Agricole, Revolut…" value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={60} /></label>
      <label className="label">Solde actuel (€)
        <input className="input" inputMode="decimal" placeholder="0,00" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d.,-]/g, ""))} disabled={synced} />
      </label>
      {synced && <p className="formHint"><Icon name="info" size={14} />Compte synchronisé : le solde vient directement de votre banque.</p>}
      <button className="btn primary lg block" disabled={busy || !ok}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter le compte"}</button>
      {editing && <DeleteButton onConfirm={async () => { if (await onDelete(account) !== false) onClose(); }} label="Supprimer le compte" />}
    </form>
  </Modal>;
}

// Fiche d'un compte : solde, dernières opérations, actions
export function AccountSheet({ account, transactions, onClose, onEdit, onAddTx, onOpenTx }) {
  const list = transactions.filter((t) => t.account_id === account.id).slice(0, 30);
  const month = todayISO().slice(0, 7), mtx = list.filter((t) => String(t.date).startsWith(month));
  const inM = mtx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0), outM = -mtx.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  return <Modal onClose={onClose} wide>
    <div className="sheetHead">
      <InstIcon name={account.institution || account.name} size={48} />
      <div className="itemMain"><b style={{ fontSize: 17 }}>{account.name}</b><small>{account.institution || "Saisi à la main"} · {KIND_LABEL[account.kind]}</small></div>
      <button type="button" className="iconBtn" onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} /></button>
    </div>
    <div className="sheetBalance"><small>Solde</small><b className="money">{money(account.balance, account.currency)}</b><span className="faint">{account.powens_account_id ? "Synchronisé " : "Mis à jour "}{ago(account.updated_at)}</span></div>
    <div className="sheetStats"><div><small>Entrées ce mois</small><b className="ok">+{money(inM)}</b></div><div><small>Sorties ce mois</small><b>−{money(outM)}</b></div></div>
    <div className="sheetActions">
      <button className="btn primary" onClick={onAddTx}><Icon name="plus" size={16} />Opération</button>
      <button className="btn" onClick={onEdit}><Icon name="edit" size={15} />Modifier</button>
    </div>
    <div>
      <div className="eyebrow" style={{ margin: "4px 0 2px" }}>Dernières opérations</div>
      {list.length ? <div className="list">{list.map((t) => <TxRow key={t.id} t={t} onClick={() => onOpenTx(t)} showDate />)}</div> : <p className="muted" style={{ fontSize: 14, margin: "10px 0" }}>Aucune opération enregistrée sur ce compte.</p>}
    </div>
  </Modal>;
}

/* ---------- Budget ---------- */
export function BudgetForm({ budget, suggested, existing, average, onClose, onSave, onDelete }) {
  const editing = Boolean(budget);
  const choices = EXPENSE_CATEGORIES.filter((c) => c !== "Épargne" && (!existing.includes(c) || c === budget?.category));
  const [category, setCategory] = useState(budget?.category || suggested?.category || choices[0] || ""), [limit, setLimit] = useState(budget ? str(budget.monthly_limit) : suggested ? str(suggested.suggested) : ""), [busy, setBusy] = useState(false);
  const value = num(limit), avg = average?.(category);
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => { e.preventDefault(); if (!(value > 0) || !category) return; setBusy(true); const ok = await onSave({ category, monthly_limit: value }, budget?.category); setBusy(false); if (ok !== false) onClose(); }}>
      <Head title={editing ? "Modifier le budget" : "Nouveau budget"} sub="Un plafond mensuel pour une catégorie." onClose={onClose} />
      <div className="label">Catégorie<CatGrid list={choices} value={category} onChange={setCategory} /></div>
      <label className="amountField"><input inputMode="decimal" placeholder="0" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Plafond mensuel" /><span>€ / mois</span></label>
      {avg > 0 && <button type="button" className="avgHint" onClick={() => setLimit(String(Math.ceil(avg / 10) * 10))}><Icon name="sparkles" size={14} />Vous dépensez en moyenne <b>{money(avg)}</b> par mois en {category}. Utiliser {Math.ceil(avg / 10) * 10} €</button>}
      <button className="btn primary lg block" disabled={busy || !(value > 0) || !category}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le budget"}</button>
      {editing && <DeleteButton onConfirm={async () => { if (await onDelete(budget.category) !== false) onClose(); }} label="Supprimer le budget" />}
    </form>
  </Modal>;
}

/* ---------- Position ---------- */
export function HoldingForm({ holding, onClose, onSave, onDelete }) {
  const editing = Boolean(holding?.id);
  const [f, setF] = useState({ name: holding?.name || "", ticker: holding?.ticker || "", asset_class: holding?.asset_class || "ETF", quantity: str(holding?.quantity), cost_basis: str(holding?.cost_basis), value: str(holding?.value) }), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: k === "ticker" ? e.target.value.toUpperCase() : e.target.value });
  const ok = f.name.trim() && num(f.quantity) > 0 && f.cost_basis !== "" && f.value !== "" && num(f.cost_basis) >= 0 && num(f.value) >= 0;
  const unit = num(f.quantity) > 0 && f.value !== "" ? num(f.value) / num(f.quantity) : null;
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => { e.preventDefault(); if (!ok) return; setBusy(true); const r = await onSave({ ...(editing ? { id: holding.id } : {}), name: f.name.trim(), ticker: f.ticker.trim() || null, asset_class: f.asset_class, quantity: num(f.quantity), cost_basis: num(f.cost_basis), value: num(f.value), currency: "EUR" }); setBusy(false); if (r !== false) onClose(); }}>
      <Head title={editing ? "Mettre à jour la position" : "Ajouter une position"} sub={editing ? "Mettez à jour la valeur actuelle quand vous le souhaitez." : "Action, ETF, crypto, fonds…"} onClose={onClose} />
      <div className="seg billingSeg" style={{ flexWrap: "wrap" }}>{Object.keys(ASSET_COLORS).map((c) => <button type="button" key={c} className={f.asset_class === c ? "on" : ""} onClick={() => setF({ ...f, asset_class: c })}>{c}</button>)}</div>
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">Nom<input className="input" placeholder="Ex. Amundi MSCI World" value={f.name} onChange={set("name")} maxLength={80} /></label>
        <label className="label">Symbole<input className="input" placeholder="Ex. CW8" value={f.ticker} onChange={set("ticker")} maxLength={12} /></label>
        <label className="label">Quantité<input className="input" inputMode="decimal" value={f.quantity} onChange={set("quantity")} /></label>
        <label className="label">Montant investi (€)<input className="input" inputMode="decimal" value={f.cost_basis} onChange={set("cost_basis")} /></label>
      </div>
      <label className="label">Valeur actuelle totale (€)<input className="input" inputMode="decimal" value={f.value} onChange={set("value")} /></label>
      {unit !== null && <p className="formHint"><Icon name="info" size={14} />Soit {money(unit)} par part{num(f.cost_basis) > 0 ? ` · plus-value ${num(f.value) - num(f.cost_basis) >= 0 ? "+" : "−"}${money(Math.abs(num(f.value) - num(f.cost_basis)))}` : ""}.</p>}
      <button className="btn primary lg block" disabled={busy || !ok}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter la position"}</button>
      {editing && <DeleteButton onConfirm={async () => { if (await onDelete(holding) !== false) onClose(); }} label="Supprimer la position" />}
    </form>
  </Modal>;
}

/* ---------- Suppression définitive du compte utilisateur ---------- */
export function DeleteMeModal({ onClose, onConfirm }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false);
  return <Modal onClose={onClose}>
    <div className="modalForm">
      <Head title="Supprimer mon compte" sub="Toutes vos données seront effacées définitivement : comptes, opérations, budgets, placements, historique. Votre abonnement éventuel sera résilié." onClose={onClose} />
      <label className="label">Pour confirmer, tapez <b>SUPPRIMER</b><input className="input" value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" /></label>
      <button className="btn lg block dangerBtn armed" disabled={busy || text.trim().toUpperCase() !== "SUPPRIMER"} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}><Icon name="trash" size={16} />{busy ? "Suppression…" : "Supprimer définitivement"}</button>
    </div>
  </Modal>;
}

