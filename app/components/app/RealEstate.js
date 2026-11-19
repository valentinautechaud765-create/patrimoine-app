"use client";
import { useMemo, useState } from "react";
import Icon from "../Icon.js";

const money = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n) || 0);
const blank = { name:"", property_type:"Appartement", address:"", acquisition_type:"Achat", ownership_type:"Pleine propriété", ownership_share:100, acquired_at:"", purchase_price:0, value:0, mortgage_remaining:0, monthly_rent:0, monthly_charges:0, property_tax:0, note:"" };
const fields = [
  ["name","Nom du bien","text"],["property_type","Type de bien","select",["Appartement","Maison","Terrain","Immeuble","Parking","Local commercial","Autre"]],
  ["address","Adresse","text"],["acquisition_type","Origine du bien","select",["Achat","Héritage","Donation","Autre"]],
  ["ownership_type","Détention","select",["Pleine propriété","Indivision","Usufruit","Nue-propriété"]],
  ["ownership_share","Votre part (%)","number"],["acquired_at","Date d’acquisition / succession","date"],
  ["purchase_price","Prix d’achat ou valeur à la succession (€)","number"],["value","Valeur actuelle estimée du bien (€)","number"],
  ["mortgage_remaining","Crédit immobilier restant (€)","number"],["monthly_rent","Loyer mensuel (€)","number"],
  ["monthly_charges","Charges mensuelles (€)","number"],["property_tax","Taxe foncière annuelle (€)","number"],["note","Notes (indivision, héritiers, estimation…)","textarea"]
];
export default function RealEstate({ properties=[], onSave, onDelete }) {
  const [editing,setEditing]=useState(null), [form,setForm]=useState(blank), [busy,setBusy]=useState(false), [error,setError]=useState("");
  const stats=useMemo(()=>properties.reduce((a,p)=>{const s=(Number(p.ownership_share)||100)/100;a.value+=(Number(p.value)||0)*s;a.debt+=(Number(p.mortgage_remaining)||0)*s;a.rent+=(Number(p.monthly_rent)||0)*s;a.charges+=(Number(p.monthly_charges)||0)*s;a.tax+=(Number(p.property_tax)||0)*s;return a;},{value:0,debt:0,rent:0,charges:0,tax:0}),[properties]);
  const net=stats.value-stats.debt;
  const begin=(p=null)=>{setEditing(p?.id||"new");setForm(p?{...blank,...p}:blank);setError("");};
  const change=(k,v)=>setForm(f=>({...f,[k]:v}));
  const save=async(e)=>{e.preventDefault();if(!form.name.trim()){setError("Donnez un nom à ce bien.");return;}setBusy(true);setError("");try{const row={...form,ownership_share:Math.min(100,Math.max(0.001,Number(form.ownership_share)||100)),...Object.fromEntries(["purchase_price","value","mortgage_remaining","monthly_rent","monthly_charges","property_tax"].map(k=>[k,Math.max(0,Number(form[k])||0)]))};if(editing!=="new")row.id=editing;await onSave(row);setEditing(null);}catch(e){setError(e.message||"Enregistrement impossible.");}finally{setBusy(false);}};
  const Field=({f})=>{const [k,label,type,opts]=f;return <label className="field"><span>{label}</span>{type==="select"?<select value={form[k]??""} onChange={e=>change(k,e.target.value)}>{opts.map(x=><option key={x}>{x}</option>)}</select>:type==="textarea"?<textarea rows="3" value={form[k]||""} onChange={e=>change(k,e.target.value)} />:<input required={k==="name"} type={type} min={type==="number"?"0":undefined} max={k==="ownership_share"?"100":undefined} step={type==="number"?"any":undefined} value={form[k]??""} onChange={e=>change(k,e.target.value)} />}</label>};
  return <div className="screen">
    <div className="screenHead"><div><p className="eyebrow">ACTIFS IMMOBILIERS</p><h2>Mon patrimoine immobilier</h2><p className="muted">Biens achetés, hérités ou reçus en donation, y compris en indivision.</p></div><button className="btn primary" onClick={()=>begin()}><Icon name="plus" size={16}/>Ajouter un bien</button></div>
    <div className="statGrid">
      <div className="statCard"><small>Valeur de votre part</small><strong>{money(stats.value)}</strong><span>Après prise en compte de votre quote-part</span></div>
      <div className="statCard"><small>Crédits immobiliers restants</small><strong>{money(stats.debt)}</strong><span>Votre part des emprunts renseignés</span></div>
      <div className="statCard"><small>Patrimoine immobilier net</small><strong>{money(net)}</strong><span>Valeur de votre part moins crédits</span></div>
      <div className="statCard"><small>Loyers mensuels (votre part)</small><strong>{money(stats.rent)}</strong><span>Charges {money(stats.charges)} / mois · taxe foncière {money(stats.tax)} / an</span></div>
    </div>
    <div className="sectionHead"><h3>Mes biens ({properties.length})</h3><span className="muted">Valeurs estimées, modifiables à tout moment</span></div>
    {!properties.length?<div className="emptyState"><Icon name="home" size={28}/><h3>Aucun bien immobilier enregistré</h3><p>Ajoutez votre résidence, un investissement locatif, un terrain ou un bien reçu en héritage.</p><button className="btn primary" onClick={()=>begin()}>Ajouter mon premier bien</button></div>:
      <div className="propertyList">{properties.map(p=>{const share=(Number(p.ownership_share)||100)/100;return <article className="propertyCard" key={p.id}><div className="propertyIcon"><Icon name={p.property_type==="Terrain"?"map":p.property_type==="Parking"?"car":"house"} size={22}/></div><div className="propertyMain"><div className="propertyTitle"><h3>{p.name}</h3><span className="chip">{p.property_type}</span>{p.acquisition_type!=="Achat"&&<span className="chip blue">{p.acquisition_type}</span>}</div><p className="muted">{p.address||"Adresse non renseignée"} · {p.ownership_type} · Votre part : {share*100}%</p><div className="propertyMetrics"><span>Valeur de votre part <b>{money(p.value*share)}</b></span><span>Crédit restant <b>{money(p.mortgage_remaining*share)}</b></span><span>Net <b>{money((p.value-p.mortgage_remaining)*share)}</b></span>{Number(p.monthly_rent)>0&&<span>Loyer / mois <b>{money(p.monthly_rent*share)}</b></span>}</div></div><div className="propertyActions"><button className="btn sm ghost" onClick={()=>begin(p)}><Icon name="edit" size={14}/>Modifier</button><button className="btn sm ghost danger" onClick={async()=>{if(window.confirm("Supprimer ce bien immobilier ?"))await onDelete(p.id);}}><Icon name="trash" size={14}/></button></div></article>;})}</div>}
    {editing!==null&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null);}}><form className="modal propertyModal" onSubmit={save}><div className="modalHead"><div><h2>{editing==="new"?"Ajouter un bien immobilier":"Modifier le bien"}</h2><p className="muted">Les montants sont saisis pour le bien entier ; Patrimo calcule automatiquement votre quote-part.</p></div><button type="button" className="iconBtn" onClick={()=>setEditing(null)}><Icon name="x"/></button></div><div className="formGrid">{fields.map(f=><Field key={f[0]} f={f}/>)}</div>{error&&<p className="formError">{error}</p>}<div className="modalFoot"><button type="button" className="btn ghost" onClick={()=>setEditing(null)}>Annuler</button><button className="btn primary" disabled={busy}>{busy?"Enregistrement…":"Enregistrer le bien"}</button></div></form></div>}
  </div>;
}
