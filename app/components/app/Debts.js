"use client";
// Onglet Dettes : ce que je dois, ce qu'on me doit, crédits (dont ceux importés de la banque).
import { useState } from "react";
import Icon from "../Icon.js";
import { money, money0, todayISO, dayLabel } from "../../../lib/format.js";
import { Modal, Head } from "./Forms.js";
import { Empty } from "./ui.js";

const KINDS = { je_dois: { label: "Je dois", short: "Je dois", icon: "downLeft", color: "var(--bad)", soft: "var(--badSoft)" }, on_me_doit: { label: "On me doit", short: "On me doit", icon: "upRight", color: "var(--ok)", soft: "var(--okSoft)" }, credit: { label: "Crédits", short: "Crédit", icon: "bank", color: "var(--warn)", soft: "var(--warnSoft)" } };
const num = (v) => Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
const str = (n) => (n === undefined || n === null || n === "" ? "" : String(n).replace(".", ","));

function DebtRow({ d, onOpen }) {
  const k = KINDS[d.kind] || KINDS.je_dois, paid = Math.max(0, Number(d.initial_amount) - Number(d.remaining)), pct = Number(d.initial_amount) > 0 ? (paid / Number(d.initial_amount)) * 100 : 0;
  const done = Number(d.remaining) === 0;
  return <button className={"debtRow tap" + (done ? " done" : "")} onClick={onOpen}>
    <span className="debtIco" style={{ background: k.soft, color: k.color }}><Icon name={done ? "check" : k.icon} size={17} /></span>
    <div className="debtMain">
      <div className="debtTop"><b>{d.person ? `${d.person} · ${d.label}` : d.label}</b><span className="money">{done ? <span className="ok">Remboursé</span> : money(d.remaining)}</span></div>
      <div className="bar"><i style={{ width: Math.min(100, pct) + "%", background: done ? "var(--ok)" : k.color }} /></div>
      <small className="muted">{money0(paid)} remboursés sur {money0(d.initial_amount)}{d.monthly_payment ? ` · ${money0(d.monthly_payment)} / mois` : ""}{d.end_date ? ` · fin ${new Date(d.end_date + "T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}` : ""}{d.powens_account_id ? " · synchronisé avec la banque" : ""}</small>
    </div>
  </button>;
}

export function Debts({ data, open }) {
  const debts = data.debts || [];
  const sum = (kind) => debts.filter((d) => d.kind === kind).reduce((n, d) => n + Number(d.remaining), 0);
  const owe = sum("je_dois"), due = sum("on_me_doit"), credit = sum("credit"), net = due - owe - credit;
  const groups = ["je_dois", "credit", "on_me_doit"].map((k) => [k, debts.filter((d) => d.kind === k).sort((a, b) => (Number(b.remaining) > 0) - (Number(a.remaining) > 0) || b.remaining - a.remaining)]).filter(([, l]) => l.length);
  return <>
    <div className="grid g4">
      {[["Je dois", owe, "downLeft", "bad"], ["Crédits", credit, "bank", "warn"], ["On me doit", due, "upRight", "ok"], ["Solde des dettes", net, "coins", net >= 0 ? "ok" : "bad"]].map(([l, v, i, tone], n) => <div key={l} className="card kpi fadeIn" style={{ animationDelay: n * 40 + "ms" }}>
        <div className="kpiTop"><span>{l}</span><span className="kpiIco" style={{ background: `var(--${tone}Soft)`, color: `var(--${tone})` }}><Icon name={i} size={16} /></span></div>
        <b className="money">{l === "Solde des dettes" ? (v >= 0 ? "+" : "−") + money(Math.abs(v)) : money(v)}</b>
        <small className="muted">{l === "Solde des dettes" ? "déjà compté dans votre patrimoine net" : `${debts.filter((d) => d.kind === ({ "Je dois": "je_dois", "Crédits": "credit", "On me doit": "on_me_doit" })[l] && Number(d.remaining) > 0).length} en cours`}</small>
      </div>)}
    </div>
    <button className="card actionCard fadeIn" onClick={() => open("debt")}>
      <span className="actionIco"><Icon name="plus" size={20} /></span>
      <div><b>Ajouter une dette</b><small>Argent prêté ou avancé par quelqu’un, crédit, somme qu’on vous doit…</small></div>
      <Icon name="chevronRight" size={18} className="faint" />
    </button>
    {data.debtsMissing && <div className="msg info">Pour activer les dettes, une petite mise à jour de la base est nécessaire : dans Supabase → SQL Editor, colle à nouveau <b>schema.sql</b> puis clique sur Run (aucune donnée n’est effacée).</div>}
    {groups.length ? groups.map(([k, list]) => <section className="card panel fadeIn" key={k}>
      <div className="panelHead"><h3><Icon name={KINDS[k].icon} size={16} />{KINDS[k].label}</h3></div>
      <div className="debtList">{list.map((d) => <DebtRow key={d.id} d={d} onOpen={() => open("debtView", { id: d.id })} />)}</div>
    </section>) : <section className="card panel"><Empty icon="coins" title="Aucune dette" text="Notez ce que vous devez et ce qu’on vous doit : le reste à rembourser est déduit (ou ajouté) à votre patrimoine net. Les crédits de votre banque apparaissent ici automatiquement une fois connectée."><button className="btn primary sm" onClick={() => open("debt")}><Icon name="plus" size={15} />Ajouter une dette</button></Empty></section>}
  </>;
}

export function DebtForm({ debt, onClose, onSave, onDelete }) {
  const editing = Boolean(debt?.id), synced = Boolean(debt?.powens_account_id);
  const [kind, setKind] = useState(debt?.kind || "je_dois");
  const [person, setPerson] = useState(debt?.person || ""), [label, setLabel] = useState(debt?.label || "");
  const [initial, setInitial] = useState(str(debt?.initial_amount)), [remaining, setRemaining] = useState(str(debt?.remaining));
  const [monthly, setMonthly] = useState(str(debt?.monthly_payment)), [rate, setRate] = useState(str(debt?.rate));
  const [start, setStart] = useState(debt?.start_date || todayISO()), [end, setEnd] = useState(debt?.end_date || ""), [busy, setBusy] = useState(false), [armed, setArmed] = useState(false);
  const ini = num(initial), rem = remaining === "" ? ini : num(remaining);
  const ok = label.trim() && ini > 0 && rem >= 0 && rem <= ini + 0.001;
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => {
      e.preventDefault(); if (!ok) return; setBusy(true);
      const r = await onSave({ ...(editing ? { id: debt.id } : {}), kind, person: person.trim() || null, label: label.trim(), initial_amount: Math.round(ini * 100) / 100, remaining: Math.round(rem * 100) / 100, monthly_payment: monthly === "" ? null : num(monthly), rate: rate === "" ? null : num(rate), start_date: start, end_date: end || null });
      setBusy(false); if (r !== false) onClose();
    }}>
      <Head title={editing ? "Modifier la dette" : "Nouvelle dette"} onClose={onClose} />
      <div className="seg billingSeg">{Object.entries(KINDS).map(([k, v]) => <button type="button" key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)} disabled={synced}>{v.short}</button>)}</div>
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">{kind === "on_me_doit" ? "Qui vous doit ?" : kind === "credit" ? "Organisme" : "À qui ?"}<input className="input" placeholder={kind === "credit" ? "Ex. Votre banque, Cetelem, Cofidis…" : kind === "on_me_doit" ? "Ex. Un ami, un membre de la famille…" : "Ex. Un ami, un proche, un collègue…"} value={person} onChange={(e) => setPerson(e.target.value)} maxLength={80} /></label>
        <label className="label">Motif<input className="input" placeholder={kind === "credit" ? "Ex. Prêt auto, prêt étudiant, travaux…" : kind === "on_me_doit" ? "Ex. Avance pour un concert, part d’un cadeau…" : "Ex. Prêt pour un voyage, avance sur le loyer…"} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} /></label>
        <label className="label">Montant de départ (€)<input className="input" inputMode="decimal" placeholder={kind === "credit" ? "Ex. 8 000" : "Ex. 200"} value={initial} onChange={(e) => setInitial(e.target.value.replace(/[^\d.,]/g, ""))} disabled={synced} /></label>
        <label className="label">Reste à rembourser (€)<input className="input" inputMode="decimal" placeholder={initial || "Égal au départ"} value={remaining} onChange={(e) => setRemaining(e.target.value.replace(/[^\d.,]/g, ""))} disabled={synced} /></label>
      </div>
      {kind === "credit" && <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">Mensualité (€)<input className="input" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value.replace(/[^\d.,]/g, ""))} /></label>
        <label className="label">Taux (%)<input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, ""))} /></label>
      </div>}
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">Date<input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="label">Échéance (facultatif)<input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {synced && <p className="formHint"><Icon name="info" size={14} />Crédit synchronisé : le reste dû vient directement de votre banque.</p>}
      {rem > ini + 0.001 && <div className="msg err">Le reste à rembourser ne peut pas dépasser le montant de départ.</div>}
      <button className="btn primary lg block" disabled={busy || !ok}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter la dette"}</button>
      {editing && <button type="button" className={"btn block dangerBtn" + (armed ? " armed" : "")} disabled={busy} onClick={async () => { if (!armed) return setArmed(true); setBusy(true); const r = await onDelete(debt); setBusy(false); if (r !== false) onClose(); }}><Icon name="trash" size={16} />{armed ? "Confirmer la suppression" : "Supprimer la dette"}</button>}
    </form>
  </Modal>;
}

export function DebtSheet({ debt: d, payments, onClose, onEdit, onPay, onDeletePayment }) {
  const k = KINDS[d.kind] || KINDS.je_dois, paid = Math.max(0, Number(d.initial_amount) - Number(d.remaining)), pct = Number(d.initial_amount) > 0 ? (paid / Number(d.initial_amount)) * 100 : 0;
  const months = d.monthly_payment > 0 ? Math.ceil(Number(d.remaining) / Number(d.monthly_payment)) : null;
  return <Modal onClose={onClose} wide>
    <div className="sheetHead">
      <span className="debtIco lg" style={{ background: k.soft, color: k.color }}><Icon name={k.icon} size={22} /></span>
      <div className="itemMain"><b style={{ fontSize: 17 }}>{d.label}</b><small>{k.short}{d.person ? " · " + d.person : ""}</small></div>
      <button type="button" className="iconBtn" onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} /></button>
    </div>
    <div className="sheetBalance"><small>{d.kind === "on_me_doit" ? "Reste à recevoir" : "Reste à rembourser"}</small><b className="money">{money(d.remaining)}</b><span className="faint">sur {money(d.initial_amount)} · {Math.round(pct)} % remboursé</span></div>
    <div className="bar" style={{ height: 8 }}><i style={{ width: Math.min(100, pct) + "%", background: Number(d.remaining) === 0 ? "var(--ok)" : k.color }} /></div>
    {(d.monthly_payment || d.rate || d.end_date) && <div className="sheetStats">
      {d.monthly_payment > 0 && <div><small>Mensualité</small><b>{money(d.monthly_payment)}</b></div>}
      {months && <div><small>Fin estimée</small><b>{months} mois</b></div>}
      {d.rate > 0 && <div><small>Taux</small><b>{String(d.rate).replace(".", ",")} %</b></div>}
      {d.end_date && <div><small>Échéance</small><b>{new Date(d.end_date + "T12:00:00").toLocaleDateString("fr-FR")}</b></div>}
    </div>}
    <div className="sheetActions">
      <button className="btn primary" onClick={onPay} disabled={Number(d.remaining) === 0 || Boolean(d.powens_account_id)}><Icon name="check" size={16} />{d.kind === "on_me_doit" ? "J’ai reçu un remboursement" : "J’ai remboursé"}</button>
      <button className="btn" onClick={onEdit}><Icon name="edit" size={15} />Modifier</button>
    </div>
    <div>
      <div className="eyebrow" style={{ margin: "4px 0 2px" }}>Remboursements</div>
      {payments.length ? <div className="list">{payments.map((p) => <div className="item" key={p.id}>
        <span className="kindIco"><Icon name="check" size={16} /></span>
        <div className="itemMain"><b>{money(p.amount)}</b><small>{dayLabel(p.date)}{p.transaction_id ? " · opération créée sur le compte" : ""}</small></div>
        <button className="iconBtn" aria-label="Annuler ce remboursement" onClick={() => onDeletePayment(p)}><Icon name="trash" size={15} /></button>
      </div>)}</div> : <p className="muted" style={{ fontSize: 14, margin: "8px 0" }}>{d.powens_account_id ? "Le reste dû est mis à jour automatiquement par votre banque." : "Aucun remboursement enregistré."}</p>}
    </div>
  </Modal>;
}

export function PaymentForm({ debt, accounts, onClose, onSave }) {
  const [amount, setAmount] = useState(str(debt.monthly_payment && debt.monthly_payment <= debt.remaining ? debt.monthly_payment : debt.remaining)), [date, setDate] = useState(todayISO()), [account, setAccount] = useState(""), [busy, setBusy] = useState(false);
  const v = num(amount), ok = v > 0 && v <= Number(debt.remaining) + 0.001;
  const inbound = debt.kind === "on_me_doit";
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => { e.preventDefault(); if (!ok) return; setBusy(true); const r = await onSave({ debt, amount: Math.round(v * 100) / 100, date, account_id: account || null }); setBusy(false); if (r !== false) onClose(); }}>
      <Head title={inbound ? "Remboursement reçu" : "Remboursement"} sub={`${debt.person ? debt.person + " · " : ""}${debt.label} · reste ${money(debt.remaining)}`} onClose={onClose} />
      <label className="amountField"><span className={inbound ? "ok" : ""}>{inbound ? "+" : "−"}</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} autoFocus aria-label="Montant" /><span>€</span></label>
      <button type="button" className="link" style={{ justifySelf: "center" }} onClick={() => setAmount(str(debt.remaining))}>Tout le reste ({money(debt.remaining)})</button>
      <div className="grid g2" style={{ gap: 12 }}>
        <label className="label">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="label">{inbound ? "Reçu sur quel compte ?" : "Payé depuis quel compte ?"}<select className="input" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Aucun (ne pas toucher aux comptes)</option>{accounts.filter((a) => !a.powens_account_id && !a.hidden).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      </div>
      <p className="formHint"><Icon name="info" size={14} />{account ? (inbound ? "Une rentrée sera ajoutée sur ce compte." : "Une dépense sera ajoutée sur ce compte, et son solde mis à jour.") : "Les comptes synchronisés avec la banque reçoivent l’opération tout seuls : inutile de les choisir."}</p>
      {v > Number(debt.remaining) + 0.001 && <div className="msg err">C’est plus que le reste dû ({money(debt.remaining)}).</div>}
      <button className="btn primary lg block" disabled={busy || !ok}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  </Modal>;
}
