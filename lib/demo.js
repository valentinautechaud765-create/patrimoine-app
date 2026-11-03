// Données de démonstration : affichées UNIQUEMENT en mode démo, toujours signalées comme fictives à l'écran.
export function demoData() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const iso = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

  const accounts = [
    { id: "a1", name: "Compte courant", institution: "Revolut", kind: "courant", balance: 2418.3, currency: "EUR", updated_at: new Date(Date.now() - 6 * 60e3).toISOString() },
    { id: "a2", name: "Compte joint", institution: "BoursoBank", kind: "courant", balance: 1290.75, currency: "EUR", updated_at: new Date(Date.now() - 42 * 60e3).toISOString() },
    { id: "a3", name: "Livret A", institution: "BoursoBank", kind: "epargne", balance: 8500, currency: "EUR", updated_at: new Date(Date.now() - 3 * 3600e3).toISOString() },
    { id: "a4", name: "LDDS", institution: "Crédit Agricole", kind: "epargne", balance: 3120.4, currency: "EUR", updated_at: new Date(Date.now() - 5 * 3600e3).toISOString() },
  ];
  const holdings = [
    { id: "h1", name: "Amundi MSCI World", ticker: "CW8", asset_class: "ETF", quantity: 12, cost_basis: 5450, value: 5912.64, currency: "EUR" },
    { id: "h2", name: "Vanguard FTSE All-World", ticker: "VWCE", asset_class: "ETF", quantity: 35, cost_basis: 4100, value: 4602.5, currency: "EUR" },
    { id: "h3", name: "Apple", ticker: "AAPL", asset_class: "Action", quantity: 5, cost_basis: 1230, value: 1204.1, currency: "EUR" },
    { id: "h4", name: "LVMH", ticker: "MC", asset_class: "Action", quantity: 2, cost_basis: 1320, value: 1268.4, currency: "EUR" },
    { id: "h5", name: "Bitcoin", ticker: "BTC", asset_class: "Crypto", quantity: 0.09, cost_basis: 4300, value: 5620.4, currency: "EUR" },
  ];
  // 3 mois d'opérations crédibles, calées sur le calendrier (salaire le 1er, loyer le 2…)
  const tx = []; let id = 0;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 10);
  const push = (d, label, amount, category) => { if (d <= today) tx.push({ id: "t" + id++, date: isoOf(d), label, amount, category }); };
  for (let m = 0; m < 3; m++) {
    const at = (day) => new Date(today.getFullYear(), today.getMonth() - m, day, 12);
    push(at(1), "Salaire", 2450, "Salaire");
    push(at(2), "Loyer", -780, "Logement");
    push(at(2), "Virement Livret A", -200, "Épargne");
    push(at(5), "EDF", -62.4, "Logement");
    push(at(8), "Netflix", -13.49, "Abonnements");
    push(at(12), "Free Mobile", -19.99, "Abonnements");
    push(at(15), "Assurance habitation", -14.9, "Logement");
  }
  const shops = [["Carrefour Market", "Courses", 25, 70], ["Monoprix", "Courses", 12, 38], ["Uber", "Transport", 9, 22], ["SNCF", "Transport", 25, 70], ["Le Petit Bistrot", "Restaurants", 18, 45], ["Deliveroo", "Restaurants", 16, 32], ["Fnac", "Loisirs", 15, 60], ["Zara", "Shopping", 25, 80], ["Pharmacie", "Santé", 6, 24], ["Boulangerie", "Courses", 3, 9]];
  for (let d = new Date(today.getFullYear(), today.getMonth() - 2, 1, 12); d <= today; d = new Date(d.getTime() + 864e5)) {
    const n = rnd() < 0.35 ? 2 : rnd() < 0.8 ? 1 : 0;
    for (let k = 0; k < n; k++) { const s = shops[Math.floor(rnd() * shops.length)]; push(d, s[0], -Math.round((s[2] + rnd() * (s[3] - s[2])) * 100) / 100, s[1]); }
  }
  tx.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const cash = accounts.reduce((n, a) => n + a.balance, 0), invest = holdings.reduce((n, h) => n + h.value, 0);
  const target = cash + invest, days = 730, walk = [0];
  for (let i = 1; i <= days; i++) walk.push(walk[i - 1] + (rnd() - 0.43) * 95);
  const snapshots = walk.map((w, i) => ({ date: iso(days - i), total: Math.round((target - walk[days] + w - (days - i) * 14) * 100) / 100 }));

  return {
    profile: { full_name: "Alex", plan: "plus", plan_status: "trialing", trial_days_left: 11 },
    accounts, holdings, transactions: tx, snapshots,
    budgets: [{ category: "Courses", monthly_limit: 350 }, { category: "Restaurants", monthly_limit: 150 }, { category: "Transport", monthly_limit: 120 }, { category: "Shopping", monthly_limit: 100 }, { category: "Loisirs", monthly_limit: 80 }],
  };
}
