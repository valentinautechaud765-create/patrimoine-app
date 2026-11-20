"use client";
// Fiche d'un placement (courbe du cours, détail de la position, transactions) et courbe du portefeuille.
import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon.js";
import { AreaChart } from "../Charts.js";
import { money, signed, pct, todayISO, dayLabel } from "../../../lib/format.js";
import { positionFromTrades } from "../../../lib/model.js";
import { Modal, Head } from "./Forms.js";
import { TickerIcon, Amount, Empty } from "./ui.js";

const num = (v) => Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
const str = (n) => (n === undefined || n === null || n === "" ? "" : String(n).replace(".", ","));
const PERIODS = ["1J", "1S", "1M", "3M", "1A", "Tout"];
const LABEL = { "1J": "aujourd’hui", "1S": "sur 7 jours", "1M": "sur 1 mois", "3M": "sur 3 mois", "1A": "sur 1 an", Tout: "depuis le début" };
const fmtWhen = (t, period) => period === "1J" || period === "1S" ? new Date(t).toLocaleString("fr-FR", { weekday: period === "1S" ? "short" : undefined, hour: "2-digit", minute: "2-digit" }) : dayLabel(new Date(t).toISOString().slice(0, 10));

// Charge une courbe (une ou plusieurs valeurs) pour une période, avec un petit cache en mémoire
const cache = {};
export function useHistory(fetchHistory, symbols, period, enabled = true) {
  const key = symbols.join(",") + "|" + period;
  const [state, setState] = useState({ key: "", data: null, loading: false, error: false });
  useEffect(() => {
    if (!enabled || !symbols.length || !fetchHistory) return;
    const hit = cache[key];
    if (hit && Date.now() - hit.at < (period === "1J" ? 60e3 : 10 * 60e3)) { setState({ key, data: hit.data, loading: false, error: false }); return; }
    let stop = false;
    setState((s) => ({ ...s, key, loading: true, error: false }));
    fetchHistory(symbols, period).then((data) => { if (stop) return; cache[key] = { at: Date.now(), data }; setState({ key, data, loading: false, error: false }); })
      .catch(() => { if (!stop) setState({ key, data: null, loading: false, error: true }); });
    return () => { stop = true; };
  }, [key, enabled]); // eslint-disable-line
  return state.key === key ? state : { data: null, loading: true, error: false };
}

/* ---------- Fiche d'un placement ---------- */
export function HoldingSheet({ holding: h, trades, tradesMissing, fetchHistory, onClose, onEdit, onTrade, onOpenTrade }) {
  const ticker = String(h.ticker || "").toUpperCase();
  const [period, setPeriod] = useState("1M");
  const hist = useHistory(fetchHistory, ticker ? [ticker] : [], period, Boolean(ticker));
  const series = hist.data?.series?.[ticker];
  const points = useMemo(() => {
    if (!series) return null;
    const pts = series.points.map((x) => ({ date: new Date(x.t).toISOString(), value: x.p }));
    if (h.live?.price && pts.length) pts.push({ date: new Date().toISOString(), value: h.live.price });
    return pts;
  }, [series, h.live?.price]);
  const cur = h.live?.currency || series?.currency || "EUR";
  const pos = positionFromTrades(trades);
  const effectiveQuantity = Math.max(0, pos.quantity + Number(h.quantity_adjustment || 0));
  const realized = Math.round((pos.realized + Number(h.realized_adjustment || 0)) * 100) / 100;
  const list = [...trades].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const gain = h.value - h.cost_basis, gainPct = h.cost_basis > 0 ? (gain / h.cost_basis) * 100 : null;
  const pru = Number(h.quantity) > 0 ? h.cost_basis / Number(h.quantity) : null;
  return <Modal onClose={onClose} wide>
    <div className="sheetHead">
      <TickerIcon holding={h} />
      <div className="itemMain"><b style={{ fontSize: 17 }}>{h.name}</b><small>{[ticker, h.asset_class, h.live?.source].filter(Boolean).join(" · ")}</small></div>
      <button type="button" className="iconBtn" onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} /></button>
    </div>

    {ticker ? <div className="holdChart">
      {points && points.length > 1 ? <AreaChart points={points} height={170} fade>
        {(pt, first, hovering) => {
          const d = pt.value - first.value, rel = first.value ? (d / first.value) * 100 : 0;
          return <div className="nwTop">
            <div>
              <div className="eyebrow">Cours{h.live && <span className="liveBadge" style={{ textTransform: "none", letterSpacing: 0, marginLeft: 8 }}><i className="liveDot" />en direct</span>}</div>
              <div className="projAmount money">{money(pt.value, cur)}</div>
              <div className="nwDelta"><span className={"chip " + (d >= 0 ? "up" : "down")}>{pct(rel)}</span><span className="nwWhen">{hovering ? fmtWhen(pt.date, period) : LABEL[period]}</span></div>
            </div>
          </div>;
        }}
      </AreaChart> : <div className="holdChartEmpty">{hist.loading ? <span className="skeleton" style={{ display: "block", height: 170 }} /> : <p className="muted">Courbe indisponible pour « {ticker} » pour le moment.</p>}</div>}
      <div className="seg holdPeriods">{PERIODS.map((p) => <button key={p} className={p === period ? "on" : ""} onClick={() => setPeriod(p)}>{p === "1J" && h.live && <i className="liveDot" />}{p}</button>)}</div>
    </div> : <p className="formHint"><Icon name="info" size={14} />Ajoutez le symbole boursier (ex. VWCE, AAPL) avec « Modifier » pour afficher la courbe et suivre le cours en direct.</p>}

    <div className="holdStats">
      <div><small>Valeur actuelle</small><b className="money">{money(h.value)}</b></div>
      <div><small>Plus-value latente</small><b className={gain >= 0 ? "ok" : "bad"}>{signed(gain)}{gainPct !== null && <em> {pct(gainPct)}</em>}</b></div>
      <div><small>Quantité détenue</small><b className="money">{Number(h.quantity).toLocaleString("fr-FR", { maximumFractionDigits: 8 })}</b></div>
      <div><small>Prix de revient moyen</small><b className="money">{pru !== null ? money(pru) : "—"}</b></div>
      <div><small>Total investi</small><b className="money">{money(h.cost_basis)}</b></div>
      {h.live?.dayGain != null && <div><small>Aujourd’hui</small><b className={h.live.dayGain >= 0 ? "ok" : "bad"}>{signed(h.live.dayGain)}</b></div>}
      {pos.dividends > 0 && <div><small>Dividendes reçus</small><b className="ok">+{money(pos.dividends)}</b></div>}
      {realized !== 0 && <div><small>Plus-values réalisées</small><b className={realized >= 0 ? "ok" : "bad"}>{signed(realized)}</b></div>}
    </div>

    {effectiveQuantity > 0 && effectiveQuantity < 0.01 && <div className="msg info" role="status">
      <b>Petite quantité résiduelle à rapprocher</b><br />
      Les transactions laissent {effectiveQuantity.toLocaleString("fr-FR", { maximumFractionDigits: 8 })} part(s). Si ton courtier affiche 0, tu peux rapprocher la position : l’historique des achats et ventes restera intact et l’écart sera comptabilisé séparément.
      <button type="button" className="btn block" style={{ marginTop: 10 }} onClick={onReconcile}>Confirmer le solde du courtier : 0 part</button>
    </div>}

    {tradesMissing ? <div className="msg info">Pour enregistrer achats, ventes et dividendes, une petite mise à jour de la base est nécessaire : dans Supabase → SQL Editor, colle à nouveau le fichier <b>schema.sql</b> puis clique sur Run (aucune donnée n’est effacée).</div> : <>
      <div className="tradeBtns">
        <button className="btn buyBtn" onClick={() => onTrade("Achat")}><Icon name="plus" size={16} />Acheter</button>
        <button className="btn sellBtn" onClick={() => onTrade("Vente")} disabled={!(Number(h.quantity) > 0)}><Icon name="downLeft" size={16} />Vendre</button>
        <button className="btn divBtn" onClick={() => onTrade("Dividende")}><Icon name="coins" size={16} />Dividende</button>
      </div>
      <div>
        <div className="eyebrow" style={{ margin: "4px 0 2px" }}>Transactions</div>
        {list.length ? <div className="list">{list.map((t) => <button key={t.id} className="item hover tap" onClick={() => onOpenTrade(t)}>
          <span className={"tradeIco " + t.type}><Icon name={t.type === "Achat" ? "plus" : t.type === "Vente" ? "downLeft" : "coins"} size={16} /></span>
          <div className="itemMain"><b>{t.type}</b><small>{dayLabel(t.date)}{t.type !== "Dividende" ? ` · ${Number(t.quantity).toLocaleString("fr-FR", { maximumFractionDigits: 8 })} × ${money(t.price, t.currency)}` : ""}{Number(t.fees) > 0 ? ` · ${money(t.fees)} de frais` : ""}</small></div>
          <div className="itemSide"><b className={t.type === "Achat" ? "" : "ok"}>{t.type === "Achat" ? "−" : "+"}{money(t.amount)}</b></div>
        </button>)}</div> : <p className="muted" style={{ fontSize: 14, margin: "8px 0" }}>Aucune transaction enregistrée. Ajoutez vos achats pour un prix de revient exact.</p>}
      </div>
    </>}
    <button className="btn block" onClick={onEdit}><Icon name="edit" size={15} />Modifier la position</button>
  </Modal>;
}

/* ---------- Achat / vente / dividende ---------- */
export function TradeForm({ holding: h, trade, initialType = "Achat", eurPerUsd, accounts = [], onClose, onSave, onDelete }) {
  const editing = Boolean(trade?.id);
  // La devise du cours actuel prime sur l’ancienne devise enregistrée (ex. AAPL coté en USD).
  const currency = h.live?.currency || trade?.currency || h.currency || "EUR";
  const fx = currency === "USD" ? (eurPerUsd || null) : 1;
  const [settlementCurrency, setSettlementCurrency] = useState(trade?.settlement_currency || "EUR");
  const settlementFx = settlementCurrency === "USD" ? (eurPerUsd || null) : 1;
  const [type, setType] = useState(trade?.type || initialType);
  const [quantity, setQuantity] = useState(str(trade?.quantity)), [manualQuantity, setManualQuantity] = useState(false);
  const [price, setPrice] = useState(str(trade?.price ?? h.live?.price ?? (Number(h.quantity) > 0 ? Math.round((h.value / h.quantity) * 10000) / 10000 : ""))), [fees, setFees] = useState(str(trade?.fees ?? 0));
  const [amount, setAmount] = useState(str(trade?.settlement_amount ?? trade?.amount)), [amountEdited, setAmountEdited] = useState(false);
  const [date, setDate] = useState(trade?.date || todayISO()), [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState(trade?.account_id || "");
  const p = num(price), f = num(fees) || 0, enteredAmount = num(amount), held = Number(h.quantity) + (editing && trade.type === "Vente" ? Number(trade.quantity) : 0) - (editing && trade.type === "Achat" ? Number(trade.quantity) : 0);
  // Le montant saisi suit la devise de règlement ; le montant comptable reste normalisé en euros.
  const enteredEur = settlementFx ? enteredAmount * settlementFx : null;
  const calculatedQuantity = p > 0 && fx && enteredEur !== null
    ? Math.max(0, (enteredEur - (type === "Achat" ? f : -f)) / (p * fx)) : 0;
  const q = type === "Dividende" ? 0 : manualQuantity ? num(quantity) : calculatedQuantity;
  // En édition, corriger la quantité ne doit jamais réécrire le montant payé
  // ni le prix unitaire : les trois valeurs peuvent différer légèrement
  // à cause des arrondis du courtier (fraction d'action).
  const eur = type === "Dividende" ? enteredEur
    : editing && !amountEdited ? Number(trade.amount)
    : enteredEur;
  const displayedAmount = amount;
  const settlementAmount = editing && !amountEdited ? Number(trade.settlement_amount ?? enteredAmount) : enteredAmount;
  const tooMuch = type === "Vente" && q > held + 1e-8;
  const ok = type === "Dividende" ? eur > 0 : q > 0 && p > 0 && eur > 0 && !tooMuch;
  return <Modal onClose={onClose}>
    <form className="modalForm" onSubmit={async (e) => {
      e.preventDefault(); if (!ok) return; setBusy(true);
      const r = await onSave({ ...(editing ? { id: trade.id } : {}), holding_id: h.id, type, quantity: Math.round(q * 1e8) / 1e8, price: type === "Dividende" ? Math.round(eur * 100) / 100 : p, fees: f, amount: Math.round(eur * 100) / 100, currency: type === "Dividende" ? "EUR" : currency, settlement_currency: settlementCurrency, settlement_amount: Math.round(settlementAmount * 100) / 100, date, account_id: accountId || null });
      setBusy(false); if (r !== false) onClose();
    }}>
      <Head title={editing ? "Modifier la transaction" : type === "Achat" ? `Acheter ${h.ticker || h.name}` : type === "Vente" ? `Vendre ${h.ticker || h.name}` : "Ajouter un dividende"} sub={type === "Vente" ? `${held.toLocaleString("fr-FR", { maximumFractionDigits: 8 })} part(s) détenue(s)` : null} onClose={onClose} />
      <div className="seg billingSeg">{["Achat", "Vente", "Dividende"].map((t) => <button type="button" key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{t}</button>)}</div>
      {type === "Vente" && held > 0 && p > 0 && fx && settlementFx && <button type="button" className="btn block" onClick={() => {
        const proceedsEur = Math.max(0, held * p * fx - f);
        setQuantity(str(held));
        setManualQuantity(true);
        setAmount(str(Math.round((proceedsEur / settlementFx) * 100) / 100));
        setAmountEdited(true);
      }}>Remplir toute la quantité détenue</button>}
      {type === "Dividende" ? <>
        <label className="amountField"><span className="ok">+</span><input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} autoFocus aria-label="Montant reçu" /><span>{settlementCurrency === "USD" ? "$" : "€"}</span></label>
        <p className="formHint"><Icon name="info" size={14} />Montant net reçu sur votre compte.</p>
      </> : <>
        <label className="amountField"><span>{type === "Achat" ? "−" : "+"}</span><input inputMode="decimal" placeholder="0,00" value={String(displayedAmount ?? "").replace(".", ",")} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); setAmountEdited(true); setManualQuantity(false); }} autoFocus aria-label="Montant" /><span>{settlementCurrency === "USD" ? "$" : "€"}</span></label>
        <label className="label">Quantité de parts (modifiable)<input className="input" inputMode="decimal" value={manualQuantity ? quantity : (q > 0 ? String(Number(q.toFixed(8))) : quantity)} onChange={(e) => { setQuantity(e.target.value.replace(/[^\d.,]/g, "")); setManualQuantity(true); }} aria-label="Quantité de parts" /><small className="muted">{editing ? "Tu peux corriger la quantité sans modifier le montant payé ni le prix unitaire d'origine." : "Calculée automatiquement à partir du montant et du cours. Tu peux aussi la corriger sans changer le montant saisi."}</small></label>
        <label className="label">Devise du règlement<select className="input" value={settlementCurrency} onChange={(e) => { setSettlementCurrency(e.target.value); setManualQuantity(false); }}><option value="EUR">Euro (€)</option><option value="USD">Dollar américain ($)</option></select></label>
        {settlementCurrency === "USD" && !settlementFx && <p className="formHint"><Icon name="info" size={14} />Taux EUR/USD indisponible : impossible de convertir ce règlement sans inventer de montant.</p>}
        <div className="grid g2" style={{ gap: 12 }}>
          <label className="label">Prix par part ({currency === "USD" ? "$" : "€"})<input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} /></label>
          <label className="label">Frais (€)<input className="input" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value.replace(/[^\d.,]/g, ""))} /></label>
        </div>
        {eur !== null && settlementCurrency === "USD" && <p className="formHint"><Icon name="info" size={14} />Équivalent comptabilisé : {money(eur)}. Le cours de l’action reste coté en {currency}.</p>}
        {currency === "USD" && !fx && <p className="formHint"><Icon name="info" size={14} />Cours de conversion EUR/USD indisponible : quantité et contre-valeur non calculées.</p>}
        {q > 0 && <p className="formHint"><Icon name="info" size={14} />{manualQuantity ? `Quantité corrigée : ${q.toLocaleString("fr-FR", { maximumFractionDigits: 8 })} part(s). Montant conservé : ${money(displayedAmount, settlementCurrency)}.` : `Soit ${q.toLocaleString("fr-FR", { maximumFractionDigits: 8 })} part(s).`}</p>}
        {tooMuch && <div className="msg err">Vous ne pouvez pas vendre plus que les {held.toLocaleString("fr-FR", { maximumFractionDigits: 8 })} part(s) détenues.</div>}
      </>}
      <label className="label">Compte bancaire de règlement <span className="muted">(facultatif)</span><select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Aucun compte — ne pas rattacher</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.institution ? " · " + a.institution : ""}</option>)}</select></label>
      {!accounts.length && <p className="formHint"><Icon name="info" size={14} />Ajoutez d’abord un compte dans la rubrique Comptes pour enregistrer le mouvement.</p>}
      <label className="label">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button className={"btn lg block " + (type === "Vente" ? "sellBtn solid" : type === "Dividende" ? "primary" : "buyBtn solid")} disabled={busy || !ok}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : type === "Achat" ? "Enregistrer l’achat" : type === "Vente" ? "Enregistrer la vente" : "Ajouter le dividende"}</button>
      {editing && <button type="button" className="btn block dangerBtn" disabled={busy} onClick={async () => { setBusy(true); const r = await onDelete(trade); setBusy(false); if (r !== false) onClose(); }}><Icon name="trash" size={16} />Supprimer la transaction</button>}
    </form>
  </Modal>;
}

/* ---------- Courbe du portefeuille (positions actuelles) ---------- */
export function PortfolioCurve({ holdings, trades = [], intraday, eurPerUsd, fetchHistory, accounts = [] }) {
  const [period, setPeriod] = useState("1J");
  const [selectedTradeId, setSelectedTradeId] = useState(null);
  const [selectedTradePosition, setSelectedTradePosition] = useState(null);
  const tradedHoldingIds = new Set(trades.map((t) => t.holding_id));
  const lines = holdings.filter((h) => h.ticker && (Number(h.quantity) > 0 || tradedHoldingIds.has(h.id)));
  const symbols = [...new Set(lines.map((h) => String(h.ticker).toUpperCase()))].sort();
  const hist = useHistory(fetchHistory, symbols, period, period !== "1J" && symbols.length > 0);
  const source = period === "1J" ? intraday : hist.data?.series;
  const fx = eurPerUsd || hist.data?.eurPerUsd;
  const tradesBy = useMemo(() => {
    const out = {};
    for (const t of trades) (out[t.holding_id] ||= []).push(t);
    for (const list of Object.values(out)) list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    return out;
  }, [trades]);

  // Chaque point conserve la valeur du portefeuille ET sa performance réelle :
  // latent + réalisé + dividendes, comparés au montant total des achats.
  // Les opérations antérieures au début de la période servent à reconstituer
  // les quantités et le prix de revient déjà détenus au premier point.
  const points = useMemo(() => {
    if (!source || !lines.length) return null;
    const usable = lines.filter((h) => tradesBy[h.id]?.length && source[String(h.ticker).toUpperCase()]?.points?.length);
    if (!usable.length) return null;
    const times = [...new Set(usable.flatMap((h) => source[String(h.ticker).toUpperCase()].points.map((x) => x.t)))].sort((a, b) => a - b);
    if (!times.length) return null;
    const firstDay = new Date(times[0]).toISOString().slice(0, 10);
    const cursors = Object.fromEntries(usable.map((h) => [h.id, 0]));
    const tradeIndexes = Object.fromEntries(usable.map((h) => [h.id, 0]));
    const state = Object.fromEntries(usable.map((h) => [h.id, { quantity: 0, cost: 0, realized: 0, dividends: 0, grossBuys: 0 }]));

    // Amorçage : les achats/ventes/dividendes avant la fenêtre restent comptés.
    for (const h of usable) {
      const s = state[h.id];
      for (const tr of tradesBy[h.id]) {
        if (String(tr.date) >= firstDay) break;
        const q = Number(tr.quantity) || 0, amount = Number(tr.amount) || 0;
        if (tr.type === "Achat") { s.quantity += q; s.cost += amount; s.grossBuys += amount; }
        else if (tr.type === "Vente") {
          const avg = s.quantity > 0 ? s.cost / s.quantity : 0, sold = Math.min(q, s.quantity);
          s.cost = Math.max(0, s.cost - avg * sold); s.quantity = Math.max(0, s.quantity - sold);
          s.realized += amount - avg * sold;
        } else if (tr.type === "Dividende") s.dividends += amount;
        tradeIndexes[h.id]++;
      }
    }

    const out = times.map((t) => {
      const day = new Date(t).toISOString().slice(0, 10);
      let total = 0, costBasis = 0, realized = 0, dividends = 0, grossBuys = 0;
      for (const h of usable) {
        const symbol = String(h.ticker).toUpperCase(), srs = source[symbol], arr = srs.points, st = state[h.id], list = tradesBy[h.id];
        while (cursors[h.id] + 1 < arr.length && arr[cursors[h.id] + 1].t <= t) cursors[h.id]++;
        while (tradeIndexes[h.id] < list.length && String(list[tradeIndexes[h.id]].date) <= day) {
          const tr = list[tradeIndexes[h.id]++], q = Number(tr.quantity) || 0, amount = Number(tr.amount) || 0;
          if (tr.type === "Achat") { st.quantity += q; st.cost += amount; st.grossBuys += amount; }
          else if (tr.type === "Vente") {
            const avg = st.quantity > 0 ? st.cost / st.quantity : 0, sold = Math.min(q, st.quantity);
            st.cost = Math.max(0, st.cost - avg * sold); st.quantity = Math.max(0, st.quantity - sold);
            st.realized += amount - avg * sold;
          } else if (tr.type === "Dividende") st.dividends += amount;
        }
        const rate = srs.currency === "USD" ? (fx || 0) : 1;
        total += Math.max(0, st.quantity) * arr[cursors[h.id]].p * rate;
        costBasis += st.cost; realized += st.realized; dividends += st.dividends; grossBuys += st.grossBuys;
      }
      const unrealized = total - costBasis, gain = unrealized + realized + dividends;
      return {
        date: new Date(t).toISOString(), value: Math.round(total * 100) / 100,
        costBasis: Math.round(costBasis * 100) / 100,
        unrealized: Math.round(unrealized * 100) / 100,
        realized: Math.round(realized * 100) / 100,
        dividends: Math.round(dividends * 100) / 100,
        grossBuys: Math.round(grossBuys * 100) / 100,
        totalGain: Math.round(gain * 100) / 100,
        gainPct: grossBuys > 0 ? gain / grossBuys * 100 : 0,
      };
    });
    // Dernier point valorisé avec les cours actuels réellement affichés dans Patrimo.
    const latestValue = usable.reduce((n, h) => n + (Number(h.value) || 0), 0);
    const last = out[out.length - 1];
    if (last) out.push({ ...last, date: new Date().toISOString(), value: Math.round(latestValue * 100) / 100,
      unrealized: Math.round((latestValue - last.costBasis) * 100) / 100,
      totalGain: Math.round((latestValue - last.costBasis + last.realized + last.dividends) * 100) / 100,
      gainPct: last.grossBuys > 0 ? ((latestValue - last.costBasis + last.realized + last.dividends) / last.grossBuys) * 100 : 0 });
    return out;
  }, [source, lines, tradesBy, fx]);

  const hasUntracked = lines.some((h) => !tradesBy[h.id]?.length);
  const events = useMemo(() => {
    if (!points?.length) return [];
    const firstDay = String(points[0].date).slice(0, 10), lastDay = String(points[points.length - 1].date).slice(0, 10);
    const ids = new Set(lines.map((h) => h.id));
    return trades.filter((t) => ids.has(t.holding_id) && String(t.date) >= firstDay && String(t.date) <= lastDay)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .map((t) => {
        const h = holdings.find((x) => x.id === t.holding_id);
        const amount = Number(t.amount) || 0;
        const account = accounts.find((a) => a.id === t.account_id);
        let realized = null;
        if (t.type === "Vente") {
          let quantity = 0, cost = 0;
          for (const prior of tradesBy[t.holding_id] || []) {
            if (prior.id === t.id) break;
            const q = Number(prior.quantity) || 0, a = Number(prior.amount) || 0;
            if (prior.type === "Achat") { quantity += q; cost += a; }
            else if (prior.type === "Vente") { const avg = quantity > 0 ? cost / quantity : 0, sold = Math.min(q, quantity); cost = Math.max(0, cost - avg * sold); quantity = Math.max(0, quantity - sold); }
          }
          const avg = quantity > 0 ? cost / quantity : 0;
          realized = amount - avg * Math.min(Number(t.quantity) || 0, quantity);
        }
        return { ...t, holdingName: h?.name || h?.ticker || "Placement", ticker: h?.ticker || "", accountName: account?.name || "", realized,
          title: t.type + " · " + (h?.name || h?.ticker || "Placement") + " · " + dayLabel(String(t.date)) + " · " + money(Math.abs(amount), "EUR") };
      });
  }, [points, trades, lines, holdings, accounts, tradesBy]);
  const selectedTrade = events.find((t) => t.id === selectedTradeId) || null;
  const tradePopover = selectedTrade ? {
    x: selectedTradePosition?.x ?? 72, y: selectedTradePosition?.y ?? 42,
    content: <div className="tradePopoverCard">
      <div className="tradePopoverHead"><div className="tradePopoverTitle"><span className={"tradePopoverType " + (selectedTrade.type === "Achat" ? "buy" : selectedTrade.type === "Vente" ? "sell" : "dividend")}>{selectedTrade.type}</span><span className="muted">{dayLabel(selectedTrade.date)}</span></div>
        <button type="button" className="iconBtn" onClick={() => { setSelectedTradeId(null); setSelectedTradePosition(null); }} aria-label="Fermer le détail"><Icon name="x" size={15} /></button>
      </div>
      <b className="tradePopoverName">{selectedTrade.holdingName}{selectedTrade.ticker ? " · " + selectedTrade.ticker.toUpperCase() : ""}</b>
      <div className="tradePopoverGrid">
        {selectedTrade.type !== "Dividende" && <div><small>Quantité</small><b>{Number(selectedTrade.quantity).toLocaleString("fr-FR", { maximumFractionDigits: 8 })}</b></div>}
        {selectedTrade.type !== "Dividende" && <div><small>Prix unitaire</small><b>{money(selectedTrade.price, selectedTrade.currency || "EUR")}</b></div>}
        <div><small>{selectedTrade.type === "Achat" ? "Montant investi" : selectedTrade.type === "Vente" ? "Montant récupéré" : "Dividende reçu"}</small><b>{selectedTrade.type === "Achat" ? "−" : "+"}{money(selectedTrade.settlement_amount ?? selectedTrade.amount, selectedTrade.settlement_currency || "EUR")}</b></div>
        {Number(selectedTrade.fees) > 0 && <div><small>Frais</small><b>{money(selectedTrade.fees, "EUR")}</b></div>}
        {selectedTrade.type === "Vente" && <div><small>Plus-value réalisée estimée</small><b className={selectedTrade.realized >= 0 ? "ok" : "bad"}>{signed(selectedTrade.realized)}</b></div>}
        {selectedTrade.accountName && <div><small>Compte de règlement</small><b>{selectedTrade.accountName}</b></div>}
      </div>
    </div>
  } : null;

  if (!symbols.length) return null;
  const periodsBar = <div className="seg heroPeriods" role="tablist" aria-label="Période de la courbe">{PERIODS.map((p) => <button type="button" role="tab" aria-selected={p === period} key={p} className={p === period ? "on" : ""} onClick={() => setPeriod(p)}>{p === "1J" && <i className="liveDot" />}{p}</button>)}</div>;
  const axis = points?.length > 1 ? [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]].map((p) => fmtWhen(p.date, period)) : null;
  return <section className="netWorth heroOpen portfolioCurve fadeIn">
    {points && points.length > 1 ? <AreaChart points={points} height={250} fade markers={events} scaleLabels markerPopover={tradePopover} onMarkerClick={(marker, position) => { setSelectedTradeId(marker.id); setSelectedTradePosition(position); }} onMarkerDismiss={() => { setSelectedTradeId(null); setSelectedTradePosition(null); }}>
      {(pt, first, hovering) => {
        const gain = Number(pt.totalGain) || 0, gainPct = Number(pt.gainPct) || 0;
        return <div className="nwTop">
          <div>
            <div className="eyebrow">Valeur du portefeuille</div>
            <div className="projAmount"><Amount value={pt.value} /></div>
            <div className="nwDelta">
              <span className={"chip " + (gain >= 0 ? "up" : "down")}>{pct(gainPct)}</span>
              <span className={gain >= 0 ? "ok" : "bad"}>{signed(gain)} de plus-value totale</span>
              <span className="nwWhen">{hovering ? fmtWhen(pt.date, period) : LABEL[period]}</span>
            </div>
            <div className="finePrint" style={{ marginTop: 7, justifyContent: "flex-start", gap: 12 }}>
              <span>Latente <b className={pt.unrealized >= 0 ? "ok" : "bad"}>{signed(pt.unrealized)}</b></span>
              <span>Réalisée <b className={pt.realized >= 0 ? "ok" : "bad"}>{signed(pt.realized)}</b></span>
              <span>Dividendes <b className="ok">{signed(pt.dividends)}</b></span>
            </div>
          </div>
        </div>;
      }}
    </AreaChart> : <div className="nwTop"><div><div className="eyebrow">Évolution du portefeuille</div><p className="muted" style={{ margin: "8px 0" }}>{period === "1J" || hist.loading ? "Chargement de la courbe…" : "Historique indisponible : ajoutez les achats et ventes datés pour reconstituer le portefeuille."}</p></div></div>}
    {axis && <div className="nwAxis" aria-hidden="true"><span>{axis[0]}</span><span>{axis[1]}</span><span>{period === "1J" ? "Maintenant" : "Aujourd’hui"}</span></div>}
    {periodsBar}
    {events.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
      <span className="finePrint" style={{ margin: "2px 5px 0 0" }}>Transactions :</span>
      {events.slice(-3).reverse().map((t) => <button type="button" key={t.id} title={t.title} onClick={() => { setSelectedTradeId(t.id); setSelectedTradePosition({ x: 72, y: 42 }); }} className="chip" style={{ fontSize: 11, border: "1px solid " + (t.type === "Achat" ? "rgba(46,229,157,.35)" : t.type === "Vente" ? "rgba(255,107,122,.35)" : "rgba(255,180,84,.35)"), color: t.type === "Achat" ? "#2ee59d" : t.type === "Vente" ? "#ff6b7a" : "#ffb454" }}>
        {t.type} · {t.holdingName} · {String(t.date).slice(5).split("-").reverse().join("/")} · {money(Math.abs(Number(t.amount) || 0), "EUR")}
      </button>)}
    </div>}
    {events.length === 0 && <p className="finePrint" style={{ margin: "10px 0 0" }}>Aucune transaction sur cette période.</p>}
    <p className="finePrint" style={{ justifyContent: "flex-start", margin: "10px 0 0" }}><Icon name="info" size={13} />Courbe de valeur du portefeuille. Les points verts signalent les achats, les rouges les ventes et les jaunes les dividendes ; survolez un point pour voir le détail.{hasUntracked ? " Certaines positions sans transactions datées sont exclues de la courbe." : ""}</p>
  </section>;
}
