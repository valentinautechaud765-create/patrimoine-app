import { todayISO } from "./format.js";
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
  const total = cash + savings + invest;
  const ofMonth = (m) => data.transactions.filter((t) => String(t.date).startsWith(m));
  const tx = ofMonth(month), prev = ofMonth(prevMonth);
  const income = sum(tx.filter((t) => t.amount > 0), (t) => t.amount);
  const spent = -sum(tx.filter((t) => t.amount < 0 && t.category !== "Épargne"), (t) => t.amount);
  const saved = -sum(tx.filter((t) => t.category === "Épargne"), (t) => t.amount);
  const prevSpent = -sum(prev.filter((t) => t.amount < 0 && t.category !== "Épargne"), (t) => t.amount);
  const byCat = {};
  tx.filter((t) => t.amount < 0 && t.category !== "Épargne").forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) - Number(t.amount); });
  const prevByCat = {};
  prev.filter((t) => t.amount < 0).forEach((t) => { prevByCat[t.category] = (prevByCat[t.category] || 0) - Number(t.amount); });
  const now0 = new Date(), prevByCatToDate = {};
  prev.filter((t) => t.amount < 0 && t.category !== "Épargne" && Number(String(t.date).slice(8, 10)) <= now0.getDate()).forEach((t) => { prevByCatToDate[t.category] = (prevByCatToDate[t.category] || 0) - Number(t.amount); });
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), day = now.getDate();
  const daysLeft = dim - day + 1;
  // Même période le mois dernier (du 1er au même jour), pour une comparaison juste.
  const prevSpentToDate = -sum(prev.filter((t) => t.amount < 0 && t.category !== "Épargne" && Number(String(t.date).slice(8, 10)) <= day), (t) => t.amount);
  const savingsRate = income > 0 ? Math.max(0, (income - spent) / income * 100) : null;
  const allocation = {};
  data.holdings.forEach((h) => { allocation[h.asset_class || "Action"] = (allocation[h.asset_class || "Action"] || 0) + Number(h.value || 0); });
  const budgets = data.budgets.map((b) => ({ ...b, spent: byCat[b.category] || 0, pace: (byCat[b.category] || 0) / b.monthly_limit, expected: day / dim }));
  return { month, cash, savings, invest, cost, hValue, total, income, spent, saved, prevSpent, prevSpentToDate, prevByCatToDate, byCat, prevByCat, daysLeft, dayOfMonth: day, daysInMonth: dim, savingsRate, allocation, budgets, perDay: daysLeft > 0 ? Math.max(0, income - spent - saved) / daysLeft : 0 };
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
    const income = tx.filter((t) => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
    const spent = Math.abs(tx.filter((t) => t.amount < 0 && t.category !== "Épargne").reduce((s, t) => s + Number(t.amount), 0));
    return { month: m, income, spent, net: income - spent, count: tx.length };
  });
}

// Opérations qui reviennent chaque mois (même libellé, montant stable) : abonnements, loyer, salaire…
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
  transactions.filter((t) => t.amount < 0 && months.includes(ym(t.date)) && !["Épargne", "Logement"].includes(t.category)).forEach((t) => { per[t.category] = (per[t.category] || 0) - Number(t.amount); });
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
