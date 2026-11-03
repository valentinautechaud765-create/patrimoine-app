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
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), day = now.getDate();
  const daysLeft = dim - day + 1;
  // Même période le mois dernier (du 1er au même jour), pour une comparaison juste.
  const prevSpentToDate = -sum(prev.filter((t) => t.amount < 0 && t.category !== "Épargne" && Number(String(t.date).slice(8, 10)) <= day), (t) => t.amount);
  const savingsRate = income > 0 ? Math.max(0, (income - spent) / income * 100) : null;
  const allocation = {};
  data.holdings.forEach((h) => { allocation[h.asset_class || "Action"] = (allocation[h.asset_class || "Action"] || 0) + Number(h.value || 0); });
  const budgets = data.budgets.map((b) => ({ ...b, spent: byCat[b.category] || 0, pace: (byCat[b.category] || 0) / b.monthly_limit, expected: day / dim }));
  return { month, cash, savings, invest, cost, hValue, total, income, spent, saved, prevSpent, prevSpentToDate, byCat, prevByCat, daysLeft, dayOfMonth: day, daysInMonth: dim, savingsRate, allocation, budgets, perDay: daysLeft > 0 ? Math.max(0, income - spent - saved) / daysLeft : 0 };
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
