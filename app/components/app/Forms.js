"use client";
// Fenêtres d'ajout / modification / suppression : opérations, comptes, budgets, positions.
import { useEffect, useState } from "react";
import Icon from "../Icon.js";
import { money, todayISO } from "../../../lib/format.js";
import { ASSET_COLORS, CUSTOM_ICONS, cat, categoriesFor, freeCustomColors } from "../../../lib/categories.js";
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

function CatGrid({ list, value, onChange, type = "out", onAdd }) {
  const [adding, setAdding] = useState(false);
  return <>
    <div className="catGrid">
      {list.map((c) => <button type="button" key={c} className={"catPick" + (value === c ? " on" : "")} style={{ "--c": cat(c).color }} onClick={() => onChange(c)}><Icon name={cat(c).icon} size={18} /><span>{c}</span></button>)}
      {onAdd && !adding && <button type="button" className="catPick addPick" onClick={() => setAdding(true)}><Icon name="plus" size={18} /><span>Nouvelle</span></button>}
    </div>
    {adding && <NewCategory type={type} onCancel={() => setAdding(false)} onSave={async (c) => { const r = await onAdd(c); if (r === false) return; onChange(r?.name || c.name); setAdding(false); }} />}
  </>;
}

// Petite fenêtre intégrée : créer sa propre catégorie (enregistrée dans le compte)
function NewCategory({ type, onCancel, onSave }) {
  const [palette] = useState(() => freeCustomColors());
  const [name, setName] = useState(""), [icon, setIcon] = useState("tag"), [color, setColor] = useState(palette[0] || "#9aa3b2"), [busy, setBusy] = useState(false);
  const ok = name.trim().length > 0;
  const save = async () => { if (!ok || busy) return; setBusy(true); await onSave({ name: name.trim(), type, icon, color }); setBusy(false); };
  return <div className="newCat" style={{ "--c": color }}>
    <div className="newCatHead"><span className="newCatIco"><Icon name={icon} size={18} /></span><input className="input" placeholder={type === "in" ? "Ex. Baby-sitting, Pourboires…" : "Ex. Coiffeur, Tabac, Jardin…"} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} maxLength={24} autoFocus aria-label="Nom de la catégorie" /></div>
    <div className="newCatIcons">{CUSTOM_ICONS.map((i) => <button type="button" key={i} className={icon === i ? "on" : ""} onClick={() => setIcon(i)} aria-label={i}><Icon name={i} size={17} /></button>)}</div>
    <div className="newCatColors">{palette.map((c) => <button type="button" key={c} className={color === c ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label="Couleur" />)}</div>
    <div className="newCatBtns"><button type="button" className="btn ghost sm" onClick={onCancel}>Annuler</button><button type="button" className="btn primary sm" disabled={!ok || busy} onClick={save}>{busy ? "Ajout…" : `Créer « ${name.trim() || "…"} »`}</button></div>
  </div>;
}

/* ---------- Opération ---------- */
export function TxForm({ tx, accounts, defaultAccount, onClose, onSave, onDelete, onAddCategory }) {
  const editing = Boolean(tx?.id);
  const [type, setType] = useState(tx && tx.amount > 0 ? "in" : "out");
  const [amount, setAmount] = useState(tx ? str(Math.abs(tx.amount)) : ""), [label, setLabel] = useState(tx?.label || "");
  const [category, setCategory] = useState(tx?.category || "Courses"), [date, setDate] = useState(tx?.date || todayISO());
  const [account, setAccount] = useState(tx?.account_id || defaultAccount || ""), [busy, setBusy] = useState(false);
  const [repeat, setRepeat] = useState(false), [repeatFreq, setRepeatFreq] = useState("mensuelle");
  const base = categoriesFor(type);
  const cats = tx?.category && !base.includes(tx.category) && (tx.amount > 0) === (type === "in") ? [...base, tx.category] : base;
  const value = num(amount), ok = value > 0 && label.trim();
  const syncedAcc = Boolean(account && accounts.find((a) => a.id === account)?.powens_account_id);
  async function submit(e) {
    e.preventDefault(); if (!ok) return;
    setBusy(true);
    const done = await onSave({ ...(tx?.id ? { id: tx.id } : {}), date, label: label.trim(), amount: type === "out" ? -value : value, category, account_id: account || null }, repeat && !editing ? repeatFreq : null);
    setBusy(false); if (done !== false) onClose();
  }
  return <Modal onClose={onClose}>
    <form onSubmit={submit} className="modalForm">
      <Head title={editing ? "Modifier l’opération" : "Nouvelle opération"} onClose={onClose} />
      <div className="seg billingSeg"><button type="button" className={type === "out" ? "on" : ""} onClick={() => { setType("out"); if (!categoriesFor("out").includes(category)) setCategory("Courses"); }}>Dépense</button><button type="button" className={type === "in" ? "on" : ""} onClick={() => { setType("in"); if (!categoriesFor("in").includes(category) || category === "Autre") setCategory("Salaire"); }}>Revenu</button></div>
      <label className="amountField"><span className={type === "out" ? "" : "ok"}>{type === "out" ? "−" : "+"}</span><input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} autoFocus={!editing} aria-label="Montant" /><span>€</span></label>
      <label className="label">Libellé<input className="input" placeholder={type === "out" ? "Ex. Carrefour, Uber…" : "Ex. Salaire, remboursement…"} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} /></label>
      <div className="label">Catégorie<CatGrid list={cats} value={category} onChange={setCategory} type={type} onAdd={onAddCategory} /></div>
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="label">Compte<select className="input" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Aucun</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.institution ? ` · ${a.institution}` : ""}{a.powens_account_id ? " (synchronisé)" : ""}</option>)}</select></label>
      </div>
      {account && !syncedAcc && <p className="formHint"><Icon name="info" size={14} />Le solde de ce compte sera mis à jour automatiquement.</p>}
      {syncedAcc && <p className="formHint"><Icon name="info" size={14} />Compte relié à la banque : le solde reste celui de la banque. Quand l’opération réelle arrivera, elle sera fusionnée avec celle-ci (pas de doublon).</p>}
      {!editing && <label className="item switchRow" style={{ borderTop: 0, padding: 0 }}><span className="kindIco"><Icon name="repeat" size={17} /></span><div className="itemMain"><b>Répéter automatiquement</b><small>{repeat ? `${{ mensuelle: "Chaque mois", hebdomadaire: "Chaque semaine", trimestrielle: "Chaque trimestre", annuelle: "Chaque année" }[repeatFreq]}, à partir de cette date` : "Salaire, loyer, abonnement…"}</small></div><input type="checkbox" className="switch" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /></label>}
      {repeat && !editing && <div className="seg billingSeg freqSeg">{[["mensuelle", "Mois"], ["hebdomadaire", "Semaine"], ["trimestrielle", "Trimestre"], ["annuelle", "Année"]].map(([v, l]) => <button type="button" key={v} className={repeatFreq === v ? "on" : ""} onClick={() => setRepeatFreq(v)}>{l}</button>)}</div>}
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
  const [rate, setRate] = useState(account?.rate != null ? str(account.rate) : "");
  const [counted, setCounted] = useState(!account?.hidden);
  const value = num(balance), ok = name.trim() && balance !== "" && Number.isFinite(value);
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => {
      e.preventDefault(); if (!ok) return; setBusy(true);
      const done = await onSave({ ...(editing ? { id: account.id } : {}), name: name.trim(), institution: institution.trim() || null, kind, ...(synced ? {} : { balance: Math.round(value * 100) / 100 }), currency: "EUR", ...(kind !== "courant" ? { rate: rate === "" ? null : Math.round(num(rate) * 100) / 100 } : { rate: null }), ...(editing ? { hidden: !counted } : {}) });
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
      {kind !== "courant" && <label className="label">Taux annuel (%){kind === "epargne" ? " · indiqué par votre banque" : " · facultatif"}<input className="input" inputMode="decimal" placeholder={kind === "epargne" ? "Ex. taux actuel de votre livret" : "Ex. 4"} value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, ""))} /></label>}
      {kind === "epargne" && <p className="formHint" style={{ marginTop: -8 }}><Icon name="info" size={14} />Sert à calculer automatiquement le rendement de vos projections.</p>}
      {editing && <label className="item switchRow" style={{ borderTop: 0, padding: 0 }}><span className="kindIco"><Icon name={counted ? "eye" : "eyeOff"} size={17} /></span><div className="itemMain"><b>Compter dans mon patrimoine</b><small>Désactivez pour un compte en double, le compte d’un proche ou un compte que vous ne voulez pas suivre.</small></div><input type="checkbox" className="switch" checked={counted} onChange={(e) => setCounted(e.target.checked)} /></label>}
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
export function BudgetForm({ budget, suggested, existing, average, onClose, onSave, onDelete, onAddCategory }) {
  const editing = Boolean(budget);
  const choices = categoriesFor("out").filter((c) => c !== "Épargne" && (!existing.includes(c) || c === budget?.category));
  const [category, setCategory] = useState(budget?.category || suggested?.category || choices[0] || ""), [limit, setLimit] = useState(budget ? str(budget.monthly_limit) : suggested ? str(suggested.suggested) : ""), [busy, setBusy] = useState(false);
  const value = num(limit), avg = average?.(category);
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => { e.preventDefault(); if (!(value > 0) || !category) return; setBusy(true); const ok = await onSave({ category, monthly_limit: value }, budget?.category); setBusy(false); if (ok !== false) onClose(); }}>
      <Head title={editing ? "Modifier le budget" : "Nouveau budget"} sub="Un plafond mensuel pour une catégorie." onClose={onClose} />
      <div className="label">Catégorie<CatGrid list={choices} value={category} onChange={setCategory} type="out" onAdd={onAddCategory} /></div>
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


/* ---------- Import depuis Mon Patrimoine ---------- */
export function ImportModal({ email, onClose, onImport }) {
  const [file, setFile] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(null);
  async function pick(e) {
    setError(""); setFile(null);
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (json.format !== "mon-patrimoine/v1") throw new Error();
      setFile(json);
    } catch { setError("Ce fichier n’est pas un export de Mon Patrimoine. Utilise le bouton « Transférer vers Patrimo » dans les paramètres de Mon Patrimoine."); }
  }
  const counts = file && [
    ["wallet", "Comptes", (file.comptes?.length || 0) + (file.livrets?.length || 0)],
    ["list", "Opérations", file.operations?.length || 0],
    ["trending", "Placements", file.placements?.length || 0],
    ["target", "Budgets", Object.keys(file.budgets || {}).length],
    ["calendar", "Jours d’historique", file.historique?.length || 0],
  ];
  return <Modal onClose={busy ? () => {} : onClose}>
    <div className="modalForm">
      <Head title="Importer depuis Mon Patrimoine" sub={done ? null : "Tes données sont ajoutées à ton compte Patrimo. Tu peux relancer l’import sans créer de doublons."} onClose={busy ? () => {} : onClose} />
      {done ? <>
        <div className="importDone"><span className="mailIco"><Icon name="checkCircle" size={26} /></span><b>Import terminé</b>
          <p>{done.comptes} compte{done.comptes > 1 ? "s" : ""}, {done.operations} opération{done.operations > 1 ? "s" : ""} ajoutée{done.operations > 1 ? "s" : ""}{done.ignorees > 0 ? ` (${done.ignorees} déjà présente${done.ignorees > 1 ? "s" : ""})` : ""}, {done.placements} placement{done.placements > 1 ? "s" : ""}, {done.budgets} budget{done.budgets > 1 ? "s" : ""} et {done.jours} jour{done.jours > 1 ? "s" : ""} d’historique.</p></div>
        <button className="btn primary lg block" onClick={onClose}>Voir mon patrimoine</button>
      </> : <>
        <ol className="mailSteps">
          <li><span>1</span><div>Dans <b>Mon Patrimoine</b>, ouvre les <b>Paramètres</b> puis touche <b>« Transférer vers Patrimo »</b> : un fichier est téléchargé.</div></li>
          <li><span>2</span><div>Choisis ce fichier ci-dessous, vérifie le résumé, puis importe.</div></li>
        </ol>
        <label className="filePick"><Icon name="upload" size={18} /><span>{file ? "Fichier prêt · changer" : "Choisir le fichier"}</span><input type="file" accept=".json,application/json" onChange={pick} /></label>
        {error && <div className="msg err">{error}</div>}
        {file && <>
          {file.email && email && file.email.toLowerCase() !== email.toLowerCase() && <div className="msg info">Ce fichier vient du compte {file.email}, différent de ton compte Patrimo ({email}).</div>}
          <div className="importGrid">{counts.map(([i, l, n]) => <div key={l}><Icon name={i} size={16} /><b>{n}</b><small>{l}</small></div>)}</div>
          <p className="formHint"><Icon name="info" size={14} />Export du {new Date(file.exportedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}. Les soldes et la valeur des placements sont ceux de ce moment-là.</p>
          <button className="btn primary lg block" disabled={busy} onClick={async () => { setBusy(true); setError(""); const r = await onImport(file); setBusy(false); if (r && r.summary) setDone(r.summary); }}>{busy ? "Import en cours…" : "Importer mes données"}</button>
        </>}
      </>}
    </div>
  </Modal>;
}

/* ---------- Opération automatique ---------- */
const FREQS = [["mensuelle", "Mois"], ["hebdomadaire", "Semaine"], ["trimestrielle", "Trimestre"], ["annuelle", "Année"]];
export function RecurrenceForm({ rec, accounts, missing, onClose, onSave, onDelete, onAddCategory }) {
  const editing = Boolean(rec?.id);
  const [type, setType] = useState(rec && rec.amount > 0 ? "in" : "out");
  const [amount, setAmount] = useState(rec ? str(Math.abs(rec.amount)) : ""), [label, setLabel] = useState(rec?.label || "");
  const [category, setCategory] = useState(rec?.category || "Logement"), [account, setAccount] = useState(rec?.account_id || "");
  const [frequency, setFrequency] = useState(rec?.frequency || "mensuelle");
  const [next, setNext] = useState(rec?.next_date || ""), [end, setEnd] = useState(rec?.end_date || ""), [active, setActive] = useState(rec ? rec.active : true), [busy, setBusy] = useState(false);
  const syncedAcc = Boolean(account && accounts.find((a) => a.id === account)?.powens_account_id);
  const day = next ? Number(next.slice(8, 10)) : null;
  const base = categoriesFor(type);
  const cats = rec?.category && !base.includes(rec.category) ? [...base, rec.category] : base;
  const value = num(amount), ok = value > 0 && label.trim() && /^\d{4}-\d{2}-\d{2}$/.test(next);
  const rule = !day ? "" : frequency === "hebdomadaire" ? `chaque ${new Date(next + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" })}` : frequency === "annuelle" ? `chaque année le ${new Date(next + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : frequency === "trimestrielle" ? `le ${day} tous les 3 mois` : `le ${day} de chaque mois`;
  const presets = [1, 5, 7, 10, 15, 25, 28].map((d) => {
    const t = new Date(), dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    let x = new Date(t.getFullYear(), t.getMonth(), Math.min(d, dim), 12);
    if (x.toISOString().slice(0, 10) < todayISO()) x = new Date(t.getFullYear(), t.getMonth() + 1, Math.min(d, new Date(t.getFullYear(), t.getMonth() + 2, 0).getDate()), 12);
    return [d, x.toISOString().slice(0, 10)];
  });
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => {
      e.preventDefault(); if (!ok) return; setBusy(true);
      const r = await onSave({ ...(editing ? { id: rec.id } : {}), label: label.trim(), amount: type === "out" ? -value : value, category, account_id: account || null, frequency, day: day || 1, next_date: next, end_date: end || null, active });
      setBusy(false); if (r !== false) onClose();
    }}>
      <Head title={editing ? "Modifier l’opération automatique" : "Nouvelle opération automatique"} sub="Créée toute seule à chaque échéance : salaire, loyer, abonnement, virement…" onClose={onClose} />
      {missing && <div className="msg info">Mise à jour de la base nécessaire : dans Supabase → SQL Editor, colle à nouveau <b>schema.sql</b> puis clique sur Run (aucune donnée n’est effacée).</div>}
      <div className="seg billingSeg"><button type="button" className={type === "out" ? "on" : ""} onClick={() => { setType("out"); if (!categoriesFor("out").includes(category)) setCategory("Logement"); }}>Dépense</button><button type="button" className={type === "in" ? "on" : ""} onClick={() => { setType("in"); if (!categoriesFor("in").includes(category) || category === "Autre") setCategory("Salaire"); }}>Revenu</button></div>
      <label className="amountField"><span className={type === "out" ? "" : "ok"}>{type === "out" ? "−" : "+"}</span><input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} autoFocus={!editing} aria-label="Montant" /><span>€</span></label>
      <label className="label">Libellé<input className="input" placeholder={type === "out" ? "Ex. Loyer, Netflix, Virement Livret A…" : "Ex. Salaire, APL…"} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} /></label>
      <div className="label">Fréquence<div className="seg billingSeg freqSeg">{FREQS.map(([v, l]) => <button type="button" key={v} className={frequency === v ? "on" : ""} onClick={() => setFrequency(v)}>{l}</button>)}</div></div>
      {frequency !== "hebdomadaire" && frequency !== "annuelle" && <div className="label">Jour du mois<div className="dayPick">{presets.map(([d, iso]) => <button type="button" key={d} className={day === d ? "on" : ""} onClick={() => setNext(iso)}>{d}</button>)}</div></div>}
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">{editing ? "Prochaine échéance" : "Première échéance"}<input className="input" type="date" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="label">Fin (facultatif)<input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {rule && <p className="formHint"><Icon name="repeat" size={14} />{type === "out" ? "Dépense" : "Revenu"} de {value > 0 ? money(value) : "…"} {rule}, à partir du {new Date(next + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}{end ? ` jusqu’au ${new Date(end + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ""}.{next < todayISO() && !syncedAcc ? " Les échéances déjà passées seront créées tout de suite." : ""}</p>}
      <div className="label">Catégorie<CatGrid list={cats} value={category} onChange={setCategory} type={type} onAdd={onAddCategory} /></div>
      <label className="label">Compte<select className="input" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Aucun</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.institution ? ` · ${a.institution}` : ""}{a.powens_account_id ? " (synchronisé)" : ""}</option>)}</select></label>
      {syncedAcc && <p className="formHint"><Icon name="info" size={14} />Compte relié à la banque : l’opération réelle arrivera avec la synchronisation, elle ne sera pas créée une deuxième fois. Ici, elle sert à prévoir vos charges à venir.</p>}
      {editing && <label className="item switchRow" style={{ borderTop: 0, padding: 0 }}><div className="itemMain"><b>Active</b><small>Désactivez-la pour la mettre en pause sans la supprimer.</small></div><input type="checkbox" className="switch" checked={active} onChange={(e) => setActive(e.target.checked)} /></label>}
      <button className="btn primary lg block" disabled={busy || !ok || missing}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l’opération automatique"}</button>
      {editing && <DeleteButton onConfirm={async () => { if (await onDelete(rec) !== false) onClose(); }} label="Supprimer l’opération automatique" />}
    </form>
  </Modal>;
}
