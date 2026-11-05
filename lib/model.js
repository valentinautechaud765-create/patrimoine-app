import { todayISO } from "./format.js";
const NEUTRAL = new Set(["Épargne", "Virement interne"]);
// Tous les chiffres affichés dans l'appli sont calculés ici, à partir des données réelles de l'utilisateur.
export function computeModel(data) {
  const month = todayISO().slice(0, 7);
  const prevMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15).toISOString().slice(0, 7);
  const sum = (arr, f) => arr.reduce((n, x) => n + (Number(f(x)) || 0), 0);
  const cashAccounts = data.accounts.filter((a) => a.kind === "courant");
  const savingsAccounts = data.accounts.filter((a) => a.kind === "epargne");
  const cash = sum(cashAccounts, (a) => a.balance), savings = sum(savingsAccounts, (a) => a.balance);
  // Comptes-titres synchronisés sans positions détaillées : leur solde compte dans les placements.
  const linked = new Set(data.holdings.map((h) => h.account_id).filter(Boolean));
  const investAccounts = data.accounts.filter((a) => a.kind === "investissement" && !linked.has(a.id));
  const invest = sum(data.holdings, (h) => h.value) + sum(investAccounts, (a) => a.balance), cost = sum(data.holdings, (h) => h.cost_basis), hValue = sum(data.holdings, (h) => h.value);
  // Dettes : ce que je dois (et les crédits) diminue le patrimoine, ce qu'on me doit l'augmente
  const debts = data.debts || [];
  const owed = sum(debts.filter((d) => d.kind !== "on_me_doit"), (d) => d.remaining), due = sum(debts.filter((d) => d.kind === "on_me_doit"), (d) => d.remaining);
  const total = cash + savings + invest + due - owed;
  const ofMonth = (m) => data.transactions.filter((t) => String(t.date).startsWith(m));
  const tx = ofMonth(month), prev = ofMonth(prevMonth);
  const income = sum(tx.filter((t) => t.amount > 0 && t.category !== "Virement interne"), (t) => t.amount);
  const spent = -sum(tx.filter((t) => t.amount < 0 && !NEUTRAL.has(t.category)), (t) => t.amount);
  const saved = -sum(tx.filter((t) => t.category === "Épargne"), (t) => t.amount);
  const prevSpent = -sum(prev.filter((t) => t.amount < 0 && !NEUTRAL.has(t.category)), (t) => t.amount);
  const byCat = {};
  tx.filter((t) => t.amount < 0 && !NEUTRAL.has(t.category)).forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) - Number(t.amount); });
  const prevByCat = {};
  prev.filter((t) => t.amount < 0 && !NEUTRAL.has(t.category)).forEach((t) => { prevByCat[t.category] = (prevByCat[t.category] || 0) - Number(t.amount); });
  const now0 = new Date(), prevByCatToDate = {};
  prev.filter((t) => t.amount < 0 && !NEUTRAL.has(t.category) && Number(String(t.date).slice(8, 10)) <= now0.getDate()).forEach((t) => { prevByCatToDate[t.category] = (prevByCatToDate[t.category] || 0) - Number(t.amount); });
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), day = now.getDate();
  const daysLeft = dim - day + 1;
  // Même période le mois dernier (du 1er au même jour), pour une comparaison juste.
  const prevSpentToDate = -sum(prev.filter((t) => t.amount < 0 && !NEUTRAL.has(t.category) && Number(String(t.date).slice(8, 10)) <= day), (t) => t.amount);
  const savingsRate = income > 0 ? Math.max(0, (income - spent) / income * 100) : null;
  const allocation = {};
  data.holdings.forEach((h) => { allocation[h.asset_class || "Action"] = (allocation[h.asset_class || "Action"] || 0) + Number(h.value || 0); });
  const budgets = data.budgets.map((b) => ({ ...b, spent: byCat[b.category] || 0, pace: (byCat[b.category] || 0) / b.monthly_limit, expected: day / dim }));
  // Ce qui doit encore tomber d'ici la fin du mois (loyer, abonnements, salaire, APL…) : opérations automatiques
  // programmées + opérations qui reviennent chaque mois dans l'historique.
  const month0 = month, rest = upcomingItems(data).filter((r) => r.next.startsWith(month0) && r.category !== "Virement interne");
  const dueLeft = -sum(rest.filter((r) => r.amount < 0), (r) => r.amount), incomingLeft = sum(rest.filter((r) => r.amount > 0), (r) => r.amount);
  const available = income - spent - saved + incomingLeft - dueLeft;
  return { month, cash, savings, invest, cost, hValue, owed, due, total, income, spent, saved, prevSpent, prevSpentToDate, prevByCatToDate, byCat, prevByCat, daysLeft, dayOfMonth: day, daysInMonth: dim, savingsRate, allocation, budgets, dueLeft, incomingLeft, available, perDay: daysLeft > 0 ? Math.max(0, available) / daysLeft : 0 };
}

// Observations calculées, jamais inventées : uniquement à partir des chiffres de l'utilisateur.
export function insights(m) {
  const out = [];
  for (const b of m.budgets) {
    if (b.spent > b.monthly_limit) out.push({ tone: "bad", icon: "target", title: `Budget ${b.category} dépassé`, text: `${Math.round(b.spent - b.monthly_limit)} € au-dessus du plafond de ${b.monthly_limit} €.` });
    else if (b.pace > b.expected + 0.2 && b.spent > 0) out.push({ tone: "warn", icon: "target", title: `${b.category} : rythme élevé`, text: `${Math.round(b.pace * 100)} % du budget utilisé alors que le mois n’est qu’à ${Math.round(b.expected * 100)} %.` });
  }
  const top = Object.entries(m.byCat).map(([c, v]) => [c, v, m.prevByCat[c] || 0]).filter(([, v, p]) => p > 30 && v < p * 0.8).sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]))[0];
  if (top && m.dayOfMonth > 20) out.push({ tone: "ok", icon: "sparkles", title: `Moins de dépenses en ${top[0]}`, text: `${Math.round(top[2] - top[1])} € de moins que le mois dernier.` });
  if (m.savingsRate !== null && m.savingsRate >= 20) out.push({ tone: "ok", icon: "piggy", title: `Taux d’épargne de ${Math.round(m.savingsRate)} %`, text: "Au-dessus des 20 % souvent recommandés. Continuez comme ça." });
  if (m.cost > 0) { const g = (m.hValue - m.cost) / m.cost * 100; out.push({ tone: g >= 0 ? "ok" : "warn", icon: "trending", title: `Investissements ${g >= 0 ? "en plus-value" : "en moins-value"}`, text: `${g >= 0 ? "+" : "−"}${Math.abs(g).toFixed(1).replace(".", ",")} % depuis vos achats.` }); }
  return out.slice(0, 3);
}

const ym = (d) => String(d).slice(0, 7);
const monthsBack = (n) => Array.from({ length: n }, (_, k) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - (n - 1 - k)); return d.toISOString().slice(0, 7); });

// Revenus et dépenses des n derniers mois (le virement vers l'épargne n'est pas une dépense)
export function monthlySeries(transactions, n = 6) {
  return monthsBack(n).map((m) => {
    const tx = transactions.filter((t) => ym(t.date) === m);
    const income = tx.filter((t) => t.amount > 0 && t.category !== "Virement interne").reduce((s, t) => s + Number(t.amount), 0);
    const spent = Math.abs(tx.filter((t) => t.amount < 0 && !NEUTRAL.has(t.category)).reduce((s, t) => s + Number(t.amount), 0));
    return { month: m, income, spent, net: income - spent, count: tx.length };
  });
}

// Opérations qui reviennent chaque mois (même libellé, montant stable) : abonnements, loyer, salaire…
// Opérations à venir : automatiques programmées d'abord, puis celles détectées dans l'historique (sans doublon).
export function upcomingItems(data) {
  const today = todayISO(), horizon = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10), planned = [];
  (data.recurrences || []).filter((r) => r.active).forEach((r) => {
    let d = r.next_date, g = 0;
    while (d && d <= horizon && (!r.end_date || d <= r.end_date) && g++ < 10) { if (d >= today) planned.push({ label: r.label, category: r.category, amount: Number(r.amount), next: d, planned: true }); d = advanceDate(d, r.frequency, r.day); }
  });
  const names = new Set(planned.map((p) => String(p.label).toLowerCase().trim()));
  return [...planned, ...recurring(data.transactions || []).filter((r) => !names.has(String(r.label).toLowerCase().trim()))].sort((a, b) => a.next.localeCompare(b.next));
}
// Calcul fait uniquement sur l'historique réel de l'utilisateur ; la date suivante est une estimation.
export function recurring(transactions) {
  const since = new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10), today = new Date().toISOString().slice(0, 10);
  const groups = {};
  transactions.filter((t) => t.date >= since).forEach((t) => {
    const key = String(t.label).toLowerCase().replace(/\d{2,}/g, "").replace(/\s+/g, " ").trim() + (t.amount > 0 ? "+" : "-");
    (groups[key] ||= []).push(t);
  });
  const out = [];
  for (const list of Object.values(groups)) {
    const months = new Set(list.map((t) => ym(t.date)));
    if (months.size < 2 || list.length > months.size + 1) continue;
    const amounts = list.map((t) => Math.abs(Number(t.amount))).sort((a, b) => a - b), med = amounts[Math.floor(amounts.length / 2)];
    if (!med || amounts.some((a) => Math.abs(a - med) / med > 0.15)) continue;
    const days = list.map((t) => Number(String(t.date).slice(8, 10))).sort((a, b) => a - b), day = days[Math.floor(days.length / 2)];
    const last = list.map((t) => t.date).sort().pop(), now = new Date();
    const thisMonth = ym(today), seenThisMonth = list.some((t) => ym(t.date) === thisMonth);
    const base = new Date(now.getFullYear(), now.getMonth() + (seenThisMonth ? 1 : 0), 1, 12);
    const dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const next = new Date(base.getFullYear(), base.getMonth(), Math.min(day, dim), 12);
    const ref = list.find((t) => t.date === last);
    out.push({ label: ref.label, category: ref.category, amount: Math.sign(ref.amount) * med, day, last, next: next.toISOString().slice(0, 10), late: !seenThisMonth && day < now.getDate() });
  }
  return out.sort((a, b) => a.next.localeCompare(b.next));
}

// Suggestions de budgets : moyenne des 3 derniers mois complets, arrondie à 10 € au-dessus.
export function budgetSuggestions(transactions, budgets) {
  const months = monthsBack(4).slice(0, 3), have = new Set(budgets.map((b) => b.category));
  const per = {};
  transactions.filter((t) => t.amount < 0 && months.includes(ym(t.date)) && !NEUTRAL.has(t.category) && t.category !== "Logement").forEach((t) => { per[t.category] = (per[t.category] || 0) - Number(t.amount); });
  const active = months.filter((m) => transactions.some((t) => ym(t.date) === m)).length;
  if (!active) return [];
  return Object.entries(per).filter(([c]) => !have.has(c)).map(([category, total]) => ({ category, average: total / active, suggested: Math.ceil(total / active / 10) * 10 })).filter((s) => s.average >= 20).sort((a, b) => b.average - a.average).slice(0, 4);
}

// Position reconstituée à partir des achats / ventes / dividendes (montants en euros, frais compris).
// Prix de revient moyen pondéré : une vente retire la part correspondante du coût.
export function positionFromTrades(trades) {
  let quantity = 0, cost = 0, realized = 0, dividends = 0;
  [...trades].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at || "").localeCompare(String(b.created_at || ""))).forEach((t) => {
    const q = Number(t.quantity) || 0, amt = Number(t.amount) || 0;
    if (t.type === "Achat") { quantity += q; cost += amt; }
    else if (t.type === "Vente") { const avg = quantity > 0 ? cost / quantity : 0, sold = Math.min(q, quantity); cost -= avg * sold; quantity -= sold; realized += amt - avg * sold; }
    else if (t.type === "Dividende") dividends += amt;
  });
  const r = (n) => Math.round(n * 1e8) / 1e8;
  return { quantity: r(Math.max(0, quantity)), cost: Math.round(Math.max(0, cost) * 100) / 100, realized: Math.round(realized * 100) / 100, dividends: Math.round(dividends * 100) / 100 };
}

// Échéance suivante d'une opération automatique
export function advanceDate(date, frequency, day) {
  const d = new Date(date + "T12:00:00");
  if (frequency === "hebdomadaire") { d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
  const months = frequency === "annuelle" ? 12 : frequency === "trimestrielle" ? 3 : 1;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, 12);
  const dim = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(Number(day) || d.getDate(), dim));
  return target.toISOString().slice(0, 10);
}
// Première échéance à partir d'aujourd'hui (inclus) pour un jour du mois donné
export function firstDate(frequency, day, from = new Date().toISOString().slice(0, 10)) {
  if (frequency === "hebdomadaire") return from;
  const f = new Date(from + "T12:00:00"), dim = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  const d = new Date(f.getFullYear(), f.getMonth(), Math.min(day, dim), 12);
  const iso = d.toISOString().slice(0, 10);
  return iso >= from ? iso : advanceDate(iso, "mensuelle", day);
}
export const FREQ_LABEL = { hebdomadaire: "Chaque semaine", mensuelle: "Chaque mois", trimestrielle: "Chaque trimestre", annuelle: "Chaque année" };
export const perMonth = (r) => Number(r.amount) * (r.frequency === "hebdomadaire" ? 52 / 12 : r.frequency === "trimestrielle" ? 1 / 3 : r.frequency === "annuelle" ? 1 / 12 : 1);

// Courbe du patrimoine détaillée (comme Mon Patrimoine) : à chaque instant coté,
// comptes = solde actuel moins les opérations passées depuis, placements = quantité détenue à cette date × cours.
export function buildWealthCurve({ series, holdings, trades = [], transactions, eurPerUsd, totalNow, sinceISO }) {
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const lines = holdings.filter((h) => h.ticker && series[String(h.ticker).toUpperCase()]?.points?.length > 1);
  if (!lines.length) return null;
  const lineValueNow = lines.reduce((n, h) => n + (Number(h.value) || 0), 0);
  const base = totalNow - lineValueNow; // comptes + placements sans cours, aujourd'hui
  const txs = transactions.filter((t) => t.account_id).map((t) => ({ d: String(t.date), a: Number(t.amount) || 0 })).sort((a, b) => a.d.localeCompare(b.d));
  const totalTx = txs.reduce((n, t) => n + t.a, 0);
  const tradesBy = {};
  trades.forEach((t) => { (tradesBy[t.holding_id] ||= []).push(t); });
  Object.values(tradesBy).forEach((l) => l.sort((a, b) => String(a.date).localeCompare(String(b.date))));
  let times = [...new Set(lines.flatMap((h) => series[String(h.ticker).toUpperCase()].points.map((x) => x.t)))].sort((a, b) => a - b);
  if (sinceISO) times = times.filter((t) => day(t) >= sinceISO);
  if (times.length < 2) return null;
  const idx = Object.fromEntries(lines.map((h) => [h.id, 0]));
  let ti = 0, upTo = 0;
  const out = times.map((t) => {
    const d = day(t);
    while (ti < txs.length && txs[ti].d <= d) upTo += txs[ti++].a;
    let v = base - (totalTx - upTo);
    for (const h of lines) {
      const s = series[String(h.ticker).toUpperCase()], pts = s.points;
      while (idx[h.id] + 1 < pts.length && pts[idx[h.id] + 1].t <= t) idx[h.id]++;
      const price = pts[idx[h.id]].p * (s.currency === "USD" ? (eurPerUsd || 0) : 1);
      const tl = tradesBy[h.id];
      const qty = tl ? tl.reduce((n, x) => n + (String(x.date) <= d ? (x.type === "Achat" ? Number(x.quantity) : x.type === "Vente" ? -Number(x.quantity) : 0) : 0), 0) : Number(h.quantity) || 0;
      v += Math.max(0, qty) * price;
    }
    return { date: new Date(t).toISOString(), value: Math.round(v * 100) / 100 };
  });
  out.push({ date: new Date().toISOString(), value: Math.round(totalNow * 100) / 100 });
  return out;
}

// ---------- Rendement automatique ----------
// Performance annuelle moyenne (en %) d'un cours sur la période fournie (au moins 1 an de données).
export function cagr(points) {
  if (!points || points.length < 2) return null;
  const a = points[0], b = points[points.length - 1], yrs = (b.t - a.t) / (365.25 * 864e5);
  const pa = a.a > 0 && b.a > 0 ? a.a : a.p, pb = a.a > 0 && b.a > 0 ? b.a : b.p;
  if (yrs < 1 || !(pa > 0) || !(pb > 0)) return null;
  return { rate: (Math.pow(pb / pa, 1 / yrs) - 1) * 100, years: yrs, withDividends: a.a > 0 && b.a > 0 };
}
// Fiabilité : moins de 3 ans de cours → estimation par type ; entre 3 et 10 ans → mélange progressif
// entre la performance réelle et la moyenne de long terme du type de placement ; 10 ans et plus → réel.
export function reliableRate(c, assetClass) {
  const base = CLASS_RATE[assetClass] ?? 5;
  if (!c || c.years < 3) return { rate: base, kind: "estimate" };
  const w = c.years >= 9.5 ? 1 : Math.min(1, c.years / 10), raw = Math.min(RATE_CAP, c.rate);
  return { rate: Math.round((w * raw + (1 - w) * base) * 10) / 10, kind: w >= 1 ? "real" : "blend", weight: w };
}
export const CLASS_RATE = { ETF: 6, Action: 6, Crypto: 8, Fonds: 4, Obligations: 3 };
export const RATE_CAP = 12;
// Détail du rendement moyen pondéré : chaque compte / placement avec son poids et son taux.
export function rateBreakdown({ accounts, holdings, cagrs = {}, onlyHoldings = false }) {
  const rows = [];
  if (!onlyHoldings) {
    const cash = accounts.filter((a) => a.kind === "courant").reduce((n, a) => n + Number(a.balance), 0);
    if (cash > 0) rows.push({ label: "Comptes courants", value: cash, rate: 0, source: "l’argent sur un compte courant ne rapporte rien" });
    accounts.filter((a) => a.kind === "epargne" && Number(a.balance) > 0).forEach((a) => {
      const r = a.rate === null || a.rate === undefined || a.rate === "" ? null : Number(a.rate);
      rows.push({ label: a.name, value: Number(a.balance), rate: r ?? 0, source: r === null ? "taux non renseigné : ajoutez-le dans le compte" : "taux de votre livret", missing: r === null, accountId: a.id });
    });
    const linked = new Set(holdings.map((h) => h.account_id).filter(Boolean));
    accounts.filter((a) => a.kind === "investissement" && !linked.has(a.id) && Number(a.balance) > 0).forEach((a) => {
      rows.push({ label: a.name, value: Number(a.balance), rate: a.rate != null && a.rate !== "" ? Number(a.rate) : CLASS_RATE.Fonds, source: a.rate != null && a.rate !== "" ? "taux saisi" : "estimation pour un compte de placement" });
    });
  }
  holdings.filter((h) => Number(h.value) > 0).forEach((h) => {
    const c = h.ticker ? cagrs[String(h.ticker).toUpperCase()] : null;
    const r = reliableRate(c, h.asset_class), yrs = c ? Math.round(c.years) : 0, real = c ? c.rate.toFixed(1).replace(".", ",") + " %" : "";
    const div = c?.withDividends ? ", dividendes compris" : "";
    const source = r.kind === "real" ? `moyenne réelle sur ${yrs} ans${div}${c.rate > RATE_CAP ? ` (${real}, plafonné à ${RATE_CAP} % par prudence)` : ""}`
      : r.kind === "blend" ? `${real} par an sur ${yrs} ans${div}, rapproché de la moyenne de long terme (historique de moins de 10 ans)`
      : c ? `historique trop court (${Math.max(1, yrs)} an${yrs > 1 ? "s" : ""}) : moyenne de long terme « ${h.asset_class} »` : `moyenne de long terme « ${h.asset_class} » (cours indisponible)`;
    rows.push({ label: h.ticker || h.name, value: Number(h.value), rate: r.rate, source, holdingId: h.id, estimated: r.kind !== "real" });
  });
  const total = rows.reduce((n, r) => n + r.value, 0);
  const weighted = total > 0 ? rows.reduce((n, r) => n + r.value * r.rate, 0) / total : 0;
  return { rows: rows.sort((a, b) => b.value - a.value), total, rate: Math.round(weighted * 10) / 10 };
}

// Simulation mois par mois : capital × (1 + r/12) + apport. Fourchette = rendement ± écart.
// inflation > 0 : résultats exprimés en euros d'aujourd'hui (pouvoir d'achat).
export function simulate({ start, monthly, rate, years, spread = 2, inflation = 0 }) {
  const n = years * 12, real = (r) => ((1 + r / 100) / (1 + inflation / 100) - 1) * 100;
  const run = (r) => { const i = real(r) / 100 / 12, out = [start]; let v = start; for (let k = 1; k <= n; k++) { v = v * (1 + i) + monthly; out.push(v); } return out; };
  const mid = run(rate), low = run(Math.max(-5, rate - spread)), high = run(rate + spread);
  const contrib = Array.from({ length: n + 1 }, (_, k) => start + monthly * k);
  return { mid, low, high, contrib, n };
}
// Épargne mensuelle « normale » : médiane des mois complets (un mois exceptionnel ne fausse pas tout).
export function monthlyNetMedian(transactions, maxMonths = 6) {
  const now = new Date(), months = Array.from({ length: maxMonths }, (_, k) => new Date(now.getFullYear(), now.getMonth() - k - 1, 15).toISOString().slice(0, 7));
  const vals = months.filter((mo) => transactions.some((t) => String(t.date).startsWith(mo))).map((mo) => {
    const tx = transactions.filter((t) => String(t.date).startsWith(mo) && !t.recurrence_id && !NEUTRAL.has(t.category));
    return { inc: tx.filter((t) => t.amount > 0).reduce((n, t) => n + Number(t.amount), 0), out: -tx.filter((t) => t.amount < 0).reduce((n, t) => n + Number(t.amount), 0) };
  });
  if (!vals.length) return { inc: 0, out: 0, months: 0 };
  const med = (arr) => { const a = [...arr].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  return { inc: med(vals.map((v) => v.inc)), out: med(vals.map((v) => v.out)), months: vals.length };
}

// Virements entre ses propres comptes (ex. Revolut → pocket) : même montant en sens inverse,
// sur deux comptes différents, à 2 jours d'écart au plus. Renvoie les identifiants à marquer.
export function findInternalTransfers(transactions, maxDays = 2) {
  const pool = transactions.filter((t) => t.account_id && t.category !== "Virement interne" && Number(t.amount) !== 0)
    .map((t) => ({ ...t, ts: new Date(String(t.date) + "T12:00:00").getTime(), cents: Math.round(Number(t.amount) * 100) }))
    .sort((a, b) => a.ts - b.ts);
  const used = new Set(), pairs = [];
  for (const out of pool) {
    if (out.cents >= 0 || used.has(out.id)) continue;
    let best = null;
    for (const inc of pool) {
      if (used.has(inc.id) || inc.cents !== -out.cents || inc.account_id === out.account_id) continue;
      const gap = Math.abs(inc.ts - out.ts) / 864e5;
      if (gap <= maxDays && (!best || gap < best.gap)) best = { inc, gap };
    }
    if (best) { used.add(out.id); used.add(best.inc.id); pairs.push([out.id, best.inc.id]); }
  }
  return pairs;
}

// Solde jour par jour d'un ensemble de comptes (pour la courbe quand on n'affiche que certains comptes)
export function balanceHistory(accounts, transactions, days) {
  const ids = new Set(accounts.map((a) => a.id)), now = accounts.reduce((n, a) => n + Number(a.balance || 0), 0);
  const tx = transactions.filter((t) => ids.has(t.account_id));
  const span = days === Infinity ? Math.max(30, Math.ceil((Date.now() - Math.min(...tx.map((t) => new Date(t.date).getTime()), Date.now())) / 864e5) + 1) : days;
  const out = [];
  for (let k = span; k >= 0; k--) {
    const d = new Date(Date.now() - k * 864e5).toISOString().slice(0, 10);
    const after = tx.filter((t) => String(t.date) > d).reduce((n, t) => n + Number(t.amount), 0);
    out.push({ date: d, value: Math.round((now - after) * 100) / 100 });
  }
  return out;
}
